from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), env_file_encoding="utf-8", extra="ignore")

    elevenlabs_api_key: str = ""
    deepl_api_key: str = ""

    frontend_url: str = "http://localhost:3000"
    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()
