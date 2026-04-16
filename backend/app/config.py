from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), env_file_encoding="utf-8", extra="ignore")

    elevenlabs_api_key: str = ""
    deepl_api_key: str = ""

    # LiteLLM proxy — all Gemini calls go through this
    gemini_api_key: str = ""                                   # proxy bearer token (GEMINI_API_KEY in .env)
    litellm_api_base: str = "https://litellm.deriv.ai/v1"     # proxy base URL
    gemini_model: str = "gemini-2.0-flash"                     # model name as configured in the proxy

    frontend_url: str = "http://localhost:3000"
    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()
