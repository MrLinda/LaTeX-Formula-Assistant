"""本地公式识别推理层。

三件事：
- 模型清单：登记可用的本地模型及其文件（大小 + SHA256）。
- 模型下载：下载到用户数据目录，**不写 site-packages**，
  这样 PyInstaller 打包后依然可写。
- 推理：按需加载 ONNX 会话并缓存，输入图片字节，输出 LaTeX。

当前只接入 RapidLaTeXOCR（LaTeX-OCR 的 ONNX 版），纯 CPU 推理。
"""

from __future__ import annotations

import hashlib
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from backend.config import models_dir

# 模型发布地址。部分网络下直连 GitHub 不可用（实测超时），
# 因此按顺序回退到公开反代；反代只做转发，文件内容由 SHA256 校验兜底。
_RELEASE_BASE = "https://github.com/RapidAI/RapidLaTeXOCR/releases/download/v0.0.0"
_SOURCE_PREFIXES = (
    "",
    "https://gh-proxy.com/",
    "https://ghfast.top/",
)

_CONNECT_TIMEOUT = 5
_READ_TIMEOUT = 60
_CHUNK_SIZE = 1024 * 256

# 上次下载成功的源下标。直连 GitHub 在部分网络下是「连不上但也不拒绝」，
# 每个文件都去重试会白等一整个 connect 超时，所以成功一次后就把该源提到最前。
_preferred_source = 0


@dataclass(frozen=True)
class ModelFile:
    name: str
    size: int
    sha256: str


@dataclass(frozen=True)
class LocalModel:
    key: str
    display_name: str
    files: tuple[ModelFile, ...]

    @property
    def total_size(self) -> int:
        return sum(f.size for f in self.files)


MODELS: dict[str, LocalModel] = {
    "rapid-latex-ocr": LocalModel(
        key="rapid-latex-ocr",
        display_name="RapidLaTeXOCR（本地·CPU·171MB）",
        files=(
            ModelFile(
                "image_resizer.onnx",
                38967751,
                "e0b075c39700f64d50400f39c8fc186bbb3b5d84d31864008313f376603aca9d",
            ),
            ModelFile(
                "encoder.onnx",
                89008136,
                "01bf5dc25539ca0cd5b1bd29296ea495977a6ba5f629dc4178277809d26e5e7d",
            ),
            ModelFile(
                "decoder.onnx",
                50952726,
                "bd695497bf1b22279b7626f5916c79226e1e244c84355f8da7edfd2d921d0072",
            ),
            ModelFile(
                "tokenizer.json",
                24174,
                "1dc27b18d6a518d0d5ff3f4bb7bd98521fe80ad39e5b2a246d4109f1bb9d5019",
            ),
        ),
    ),
}

_engine_lock = threading.Lock()
_infer_lock = threading.Lock()
_engines: dict[str, Any] = {}


def is_known(key: str) -> bool:
    """是否是已登记的本地模型。"""
    return key in MODELS


def model_size(key: str) -> int:
    """模型全部文件的总字节数；未知模型返回 0。"""
    model = MODELS.get(key)
    return model.total_size if model else 0


def model_dir(key: str) -> Path:
    """某个模型的本地目录。"""
    return models_dir() / key


def _size_matches(path: Path, spec: ModelFile) -> bool:
    """只比大小：用于每次识别前的快速检查，避免反复哈希 170MB。"""
    return path.is_file() and path.stat().st_size == spec.size


def is_downloaded(key: str) -> bool:
    """模型文件是否齐备。"""
    model = MODELS.get(key)
    if model is None:
        return False
    target = model_dir(key)
    return all(_size_matches(target / f.name, f) for f in model.files)


def _download_file(url: str, dest: Path, spec: ModelFile) -> None:
    """下载单个文件，边写边算 SHA256，校验通过后才落到最终文件名。"""
    tmp = dest.with_name(dest.name + ".part")
    digest = hashlib.sha256()
    try:
        with requests.get(
            url, stream=True, timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT)
        ) as resp:
            resp.raise_for_status()
            with tmp.open("wb") as fp:
                for chunk in resp.iter_content(_CHUNK_SIZE):
                    if chunk:
                        fp.write(chunk)
                        digest.update(chunk)

        if tmp.stat().st_size != spec.size or digest.hexdigest() != spec.sha256:
            raise ValueError(f"{spec.name} 校验失败（大小或 SHA256 不匹配）")
        tmp.replace(dest)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)


def _ordered_sources() -> tuple[str, ...]:
    """把上次成功的源轮转到最前面。"""
    first = _preferred_source
    return _SOURCE_PREFIXES[first:] + _SOURCE_PREFIXES[:first]


def _fetch(spec: ModelFile, dest: Path) -> None:
    """按顺序尝试各下载源，全部失败时汇总原因。"""
    global _preferred_source

    failures = []
    for prefix in _ordered_sources():
        url = f"{prefix}{_RELEASE_BASE}/{spec.name}"
        try:
            _download_file(url, dest, spec)
        except Exception as exc:
            failures.append(f"  {url}\n    -> {exc}")
            continue
        _preferred_source = _SOURCE_PREFIXES.index(prefix)
        return
    raise RuntimeError(
        f"{spec.name} 所有下载源均失败：\n" + "\n".join(failures)
    )


def download(key: str) -> None:
    """下载模型缺失的文件；已存在且大小正确的文件跳过。"""
    model = MODELS.get(key)
    if model is None:
        raise KeyError(key)

    target = model_dir(key)
    target.mkdir(parents=True, exist_ok=True)
    for spec in model.files:
        dest = target / spec.name
        if _size_matches(dest, spec):
            continue
        _fetch(spec, dest)


def _create_engine(key: str) -> Any:
    # 延迟导入：缺少依赖时应用仍能启动，只是本地模型不可用。
    from rapid_latex_ocr import LaTeXOCR

    target = model_dir(key)
    return LaTeXOCR(
        image_resizer_path=target / "image_resizer.onnx",
        encoder_path=target / "encoder.onnx",
        decoder_path=target / "decoder.onnx",
        tokenizer_json=target / "tokenizer.json",
    )


def _get_engine(key: str) -> Any:
    with _engine_lock:
        engine = _engines.get(key)
        if engine is None:
            engine = _create_engine(key)
            _engines[key] = engine
        return engine


def recognize(key: str, image: bytes) -> tuple[str, float]:
    """识别单张公式图片，返回 (LaTeX, 耗时秒)。"""
    if key not in MODELS:
        raise KeyError(key)
    engine = _get_engine(key)
    # ONNX 会话本身可并发，但 CPU 推理串行更可预测，避免多个请求互相抢核。
    with _infer_lock:
        return engine(image)


def list_models() -> list[dict[str, Any]]:
    """模型清单及下载状态，供 /api/models 返回。"""
    return [
        {
            "name": model.key,
            "displayName": model.display_name,
            "downloaded": is_downloaded(model.key),
            "sizeBytes": model.total_size,
        }
        for model in MODELS.values()
    ]
