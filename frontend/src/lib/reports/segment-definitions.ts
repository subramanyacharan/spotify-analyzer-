/** Plain-language definitions for report readers (non-technical stakeholders). */
export const SEGMENT_DEFINITIONS: Record<string, string> = {
  "Playlist Driven":
    "Users who primarily consume music through playlists rather than manual search or artist exploration.",
  "Discovery Seeker":
    "Users actively trying to find new music — they mention discovery features, new artists, or expanding taste.",
  "Habit Listener":
    "Users in a comfort-listening pattern — familiar tracks, routines, and repeat playback dominate their feedback.",
  "Casual Listener":
    "Light or occasional listeners whose reviews focus on basic app experience rather than deep catalog exploration.",
  "Heavy Listener":
    "High-volume listeners who use the app extensively and comment on breadth of features and playback controls.",
  "Niche Listener":
    "Users focused on specific genres or artists — often sensitive to recommendation relevance for narrow tastes.",
  "New User":
    "Recently onboarded users evaluating first impressions, onboarding, and initial recommendation quality.",
  "Premium User":
    "Paying subscribers whose feedback reflects expectations for ad-free experience and premium feature quality.",
};

export const THEME_DEFINITIONS: Record<string, string> = {
  "Recommendation Quality":
    "How well suggested songs, mixes, and radio match what users want to hear.",
  "Playlist Fatigue":
    "Frustration when playlists feel stale, repetitive, or polluted with unwanted tracks.",
  "Search & Discovery UX":
    "Difficulty finding music through search, browse, or home-screen discovery surfaces.",
  "Repetitive Recommendations":
    "The same artists or songs resurfacing too often in feeds and mixes.",
  "Discover Weekly Issues":
    "Problems specific to weekly personalized discovery playlists.",
};

export function defineSegment(name: string): string {
  return (
    SEGMENT_DEFINITIONS[name] ??
    `${name} — an audience group identified from language patterns in public app store reviews.`
  );
}

export function defineTheme(name: string): string {
  return (
    THEME_DEFINITIONS[name] ??
    `${name} — a recurring topic cluster extracted from grouped user feedback.`
  );
}
