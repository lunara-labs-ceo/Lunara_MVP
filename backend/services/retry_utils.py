"""
Retry utility for handling Gemini API 429 rate limit errors.

Wraps ADK runner.run_async() calls with exponential backoff retry logic
so users never see rate limit errors.
"""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator, Any, Callable

from google.api_core.exceptions import ResourceExhausted, TooManyRequests

logger = logging.getLogger(__name__)

# Exceptions that indicate rate limiting
_RATE_LIMIT_EXCEPTIONS = (ResourceExhausted, TooManyRequests)

MAX_RETRIES = 3
BASE_DELAY = 2.0  # seconds


async def run_with_retry(
    runner,
    *,
    user_id: str,
    session_id: str,
    new_message: Any,
    max_retries: int = MAX_RETRIES,
    base_delay: float = BASE_DELAY,
) -> AsyncIterator:
    """
    Run an ADK runner.run_async() with exponential backoff on 429 errors.

    Since run_async is an async generator, we can't simply 'await' it.
    Instead, we wrap the entire iteration and retry from scratch if a
    rate limit error occurs during streaming.

    Yields events from the runner, transparently retrying on 429.
    """
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=new_message,
            ):
                yield event
            return  # success — exit the retry loop
        except _RATE_LIMIT_EXCEPTIONS as e:
            last_error = e
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)  # 2s, 4s, 8s
                logger.warning(
                    f"Rate limited (429), retry {attempt + 1}/{max_retries} in {delay}s"
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    f"Rate limited after {max_retries + 1} attempts, giving up"
                )
                raise
