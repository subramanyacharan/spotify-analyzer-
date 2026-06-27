import sys
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

# Add project root to path for absolute imports if run directly
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from google_play_scraper import reviews, Sort
from app_store_scraper import AppStore
from src.phase1_data_pipeline.supabase_client import get_supabase_client

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SPOTIFY_PLAY_STORE_ID = 'com.spotify.music'
SPOTIFY_APP_STORE_APP_NAME = 'spotify-music-and-podcasts'
SPOTIFY_APP_STORE_APP_ID = '324684580'

def fetch_play_store_reviews(days: int = 30) -> List[Dict[str, Any]]:
    """Fetches reviews from the Google Play Store for the last N days."""
    logger.info(f"Fetching Google Play Store reviews from the last {days} days...")
    cutoff_date = datetime.now() - timedelta(days=days)
    
    formatted_reviews = []
    continuation_token = None
    batch_size = 1000
    reached_cutoff = False

    while not reached_cutoff:
        try:
            if continuation_token:
                result, continuation_token = reviews(
                    SPOTIFY_PLAY_STORE_ID,
                    continuation_token=continuation_token
                )
            else:
                result, continuation_token = reviews(
                    SPOTIFY_PLAY_STORE_ID,
                    lang='en',
                    country='us',
                    sort=Sort.NEWEST,
                    count=batch_size
                )

            if not result:
                break

            for r in result:
                # `at` is datetime object
                review_date = r.get('at')
                if review_date and review_date < cutoff_date:
                    reached_cutoff = True
                    break
                
                formatted_reviews.append({
                    "source": "play_store",
                    "review_id": f"ps_{r.get('reviewId')}",
                    "review_text": r.get('content', ''),
                    "rating": r.get('score', 0),
                    "review_date": review_date.isoformat() if review_date else None,
                    "version": r.get('reviewCreatedVersion', 'Unknown'),
                    "thumbs_up_count": r.get('thumbsUpCount', 0),
                    "metadata": {
                        "userName": r.get('userName'),
                        "replyContent": r.get('replyContent')
                    }
                })
            
            logger.info(f"Fetched {len(formatted_reviews)} Play Store reviews so far...")
            
            # If no continuation token is returned, we've hit the end
            if not continuation_token:
                break

        except Exception as e:
            logger.error(f"Error fetching Play Store reviews: {e}")
            break

    logger.info(f"Successfully fetched a total of {len(formatted_reviews)} Play Store reviews within {days} days.")
    return formatted_reviews

def fetch_app_store_reviews(days: int = 30) -> List[Dict[str, Any]]:
    """Fetches reviews from the Apple App Store for the last N days using app_store_scraper."""
    logger.info(f"Fetching Apple App Store reviews from the last {days} days...")
    cutoff_date = datetime.now() - timedelta(days=days)
    
    formatted_reviews = []
    try:
        # AppStore scraper handles its own pagination, we just fetch a large number and filter by date
        spotify = AppStore(country="us", app_name=SPOTIFY_APP_STORE_APP_NAME, app_id=SPOTIFY_APP_STORE_APP_ID)
        spotify.review(how_many=20000) # Fetch up to 20k to ensure we hit 90 days
        
        for r in spotify.reviews:
            review_date = r.get('date')
            if review_date and review_date < cutoff_date:
                continue # We skip older reviews
                
            formatted_reviews.append({
                "source": "app_store",
                "review_id": f"as_{r.get('id', hash(r.get('review', '')))}",
                "review_text": r.get('review', ''),
                "rating": r.get('rating', 0),
                "review_date": review_date.isoformat() if review_date else None,
                "version": r.get('version', 'Unknown'),
                "thumbs_up_count": 0,
                "metadata": {
                    "userName": r.get('userName'),
                    "title": r.get('title')
                }
            })
            
        logger.info(f"Successfully fetched a total of {len(formatted_reviews)} App Store reviews within {days} days.")
        return formatted_reviews
    except Exception as e:
        logger.error(f"Error fetching App Store reviews: {e}")
        return []

def store_reviews_in_supabase(reviews_data: List[Dict[str, Any]], batch_size: int = 500) -> None:
    """Stores a list of formatted reviews into Supabase using batch processing."""
    if not reviews_data:
        logger.warning("No reviews to store.")
        return

    client = get_supabase_client()
    if not client:
        logger.error("Could not connect to Supabase. Aborting storage.")
        return

    logger.info(f"Attempting to store {len(reviews_data)} reviews in Supabase in batches of {batch_size}...")
    
    success_count = 0
    error_count = 0

    for i in range(0, len(reviews_data), batch_size):
        batch = reviews_data[i:i+batch_size]
        try:
            # Upsert accepts a list of dicts. Duplicates based on 'review_id' are safely ignored/updated by PostgreSQL
            client.table("raw_reviews").upsert(batch, on_conflict="review_id").execute()
            success_count += len(batch)
            logger.info(f"Successfully processed batch {i//batch_size + 1} ({len(batch)} reviews).")
        except Exception as e:
            logger.error(f"Failed to insert batch {i//batch_size + 1}: {e}")
            error_count += len(batch)

    logger.info(f"Storage complete. Processed successfully: {success_count}, Errors: {error_count}")

def run_ingestion(days: int = 90):
    """Main orchestration function for ingestion phase."""
    logger.info(f"Starting Phase 1.2: Data Collection & Ingestion (FULL RUN for {days} days)")
    
    play_store_data = fetch_play_store_reviews(days=days)
    app_store_data = fetch_app_store_reviews(days=days)
    
    all_reviews = play_store_data + app_store_data
    
    if all_reviews:
        store_reviews_in_supabase(all_reviews)
    else:
        logger.error("No data fetched from any source.")

if __name__ == "__main__":
    # Full run fetching exactly 30 days (1 month) of historical data
    run_ingestion(days=30)
