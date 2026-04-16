"""
Gemini client that routes every request through the corporate LiteLLM proxy
at settings.litellm_api_base (default: https://litellm.deriv.ai/v1).

• File uploads  → POST  {api_base}/files          (OpenAI-compatible Files API)
• File polling  → GET   {api_base}/files/{id}     (falls back to a timed wait
                                                    if the proxy doesn't expose
                                                    the retrieve endpoint)
• Completions   → litellm.acompletion with model prefix "openai/{model}" so
                  LiteLLM library routes to the proxy instead of Google directly
"""

import asyncio
import json

import httpx
import litellm

# Silently drop unsupported provider-specific params instead of crashing
litellm.drop_params = True
# Suppress LiteLLM's verbose success/debug prints
litellm.set_verbose = False

# Fixed wait used when the proxy doesn't expose GET /files/{id}
_FALLBACK_WAIT_S = 20.0


class GeminiClient:

    def _settings(self):
        from app.config import settings
        return settings

    def _model(self) -> str:
        """Return the model name prefixed for OpenAI-compatible proxy routing."""
        return f"openai/{self._settings().gemini_model}"

    # ------------------------------------------------------------------ #
    # Text-only completions                                                #
    # ------------------------------------------------------------------ #

    async def complete(self, messages: list[dict]) -> str:
        """Plain text completion — no file attachments."""
        s = self._settings()
        resp = await litellm.acompletion(
            model=self._model(),
            messages=messages,
            api_base=s.litellm_api_base,
            api_key=s.gemini_api_key,
        )
        return resp.choices[0].message.content  # type: ignore[union-attr]

    # ------------------------------------------------------------------ #
    # File upload                                                          #
    # ------------------------------------------------------------------ #

    async def upload_file(self, file_bytes: bytes, mime_type: str) -> str:
        """
        Upload *file_bytes* to the proxy's OpenAI-compatible Files endpoint.

        Returns the file ID string (e.g. ``"files/abc123"`` for Gemini files).
        Waits until the file is ready before returning.
        """
        s = self._settings()
        ext = mime_type.split("/")[-1]
        filename = f"upload.{ext}"
        url = f"{s.litellm_api_base}/files"

        print(f"[Gemini] uploading {mime_type} ({len(file_bytes):,} bytes) → {url}")

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {s.gemini_api_key}"},
                data={"purpose": "user_data"},
                files={"file": (filename, file_bytes, mime_type)},
            )
            resp.raise_for_status()
            data = resp.json()

        file_id: str = data.get("id", "")
        if not file_id:
            raise RuntimeError(
                f"Proxy /files upload returned no 'id'. Full response: {json.dumps(data)}"
            )

        print(f"[Gemini] upload complete → file_id={file_id}, waiting for ACTIVE...")
        await self._wait_for_active(file_id)
        print(f"[Gemini] {file_id} is ready")
        return file_id

    async def _wait_for_active(
        self,
        file_id: str,
        max_attempts: int = 30,
        interval: float = 2.0,
    ) -> None:
        """
        Poll GET {api_base}/files/{file_id}.
        If the proxy returns 404/405/501 (retrieve not supported), fall back to
        a fixed wait of _FALLBACK_WAIT_S seconds.
        """
        s = self._settings()
        url = f"{s.litellm_api_base}/files/{file_id}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            for attempt in range(max_attempts):
                try:
                    resp = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {s.gemini_api_key}"},
                    )
                    if resp.status_code in (404, 405, 501):
                        print(
                            f"[Gemini] proxy does not support file status polling "
                            f"(HTTP {resp.status_code}), waiting {_FALLBACK_WAIT_S}s..."
                        )
                        await asyncio.sleep(_FALLBACK_WAIT_S)
                        return

                    resp.raise_for_status()
                    body = resp.json()
                    state: str = body.get("state", "ACTIVE")

                    if state == "FAILED":
                        raise RuntimeError(f"Gemini file processing failed: {file_id}")
                    if state in ("ACTIVE", "processed", "ready") or state not in (
                        "PROCESSING",
                        "PENDING",
                        "pending",
                        "processing",
                    ):
                        print(f"[Gemini] {file_id} state={state!r} — treating as ready")
                        return

                    print(f"[Gemini] {file_id} state={state!r} (attempt {attempt + 1}), retrying...")

                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code in (404, 405, 501):
                        print(
                            f"[Gemini] proxy file status not available "
                            f"(HTTP {exc.response.status_code}), waiting {_FALLBACK_WAIT_S}s..."
                        )
                        await asyncio.sleep(_FALLBACK_WAIT_S)
                        return
                    raise

                await asyncio.sleep(interval)

        raise TimeoutError(
            f"File did not become ready after {max_attempts * interval:.0f}s: {file_id}"
        )

    # ------------------------------------------------------------------ #
    # Multimodal completions                                               #
    # ------------------------------------------------------------------ #

    async def complete_with_files(
        self,
        prompt: str,
        files: list[tuple[str, str]],  # [(file_id, mime_type), ...]
        json_mode: bool = False,
    ) -> str:
        """
        Multimodal completion referencing pre-uploaded files.

        Parameters
        ----------
        prompt:
            Text prompt for this turn.
        files:
            List of ``(file_id, mime_type)`` returned by :meth:`upload_file`.
        json_mode:
            Ask the model to return strict JSON.
        """
        s = self._settings()

        content: list[dict] = [
            {
                "type": "file",
                "file": {"file_id": fid, "format": mime},
            }
            for fid, mime in files
        ]
        content.append({"type": "text", "text": prompt})

        kwargs: dict = dict(
            model=self._model(),
            messages=[{"role": "user", "content": content}],
            api_base=s.litellm_api_base,
            api_key=s.gemini_api_key,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        resp = await litellm.acompletion(**kwargs)
        result: str = resp.choices[0].message.content  # type: ignore[union-attr]

        # TODO: remove debug logging
        files_label = ", ".join(f"{mime}:{fid}" for fid, mime in files)
        print(f"\n{'='*60}")
        print(f"[Gemini] model={self._model()}")
        print(f"[Gemini] files=({files_label})")
        print(f"[Gemini] prompt={prompt[:120]}...")
        print(f"[Gemini] response:\n{result}")
        print(f"{'='*60}\n")
        return result


# Module-level singleton
gemini_client = GeminiClient()
