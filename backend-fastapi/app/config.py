import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/fashionstore")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
INTERNAL_KEY = os.getenv("IA_INTERNAL_KEY", "").strip()
ASSETS_DIR = os.getenv("ASSETS_DIR", "../backend-nest/public")
DATABASE_SSL = os.getenv("DATABASE_SSL", "").lower() == "true"
