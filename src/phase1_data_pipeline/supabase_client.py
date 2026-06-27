import os
import logging
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_supabase_client() -> Optional[Client]:
    """
    Initializes and returns a Supabase client.
    Requires SUPABASE_URL and SUPABASE_KEY to be set in environment variables.
    """
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        logger.error("SUPABASE_URL or SUPABASE_KEY missing in environment variables.")
        raise ValueError("Missing Supabase credentials in .env file.")

    try:
        supabase: Client = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized successfully.")
        return supabase
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        return None

if __name__ == "__main__":
    # Test connection
    try:
        client = get_supabase_client()
        # Verify connection by fetching 1 row from raw_reviews (will return empty list if table exists but empty)
        response = client.table("raw_reviews").select("id").limit(1).execute()
        print("SUCCESS: Successfully connected to Supabase!")
        print(f"Data response: {response.data}")
    except Exception as e:
        print(f"ERROR: Connection failed: {e}")
