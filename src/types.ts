export type Language = string;
export type Theme = 'light' | 'dark';
export type SubscriptionPlan = 'weekly_pass' | 'monthly' | 'annual';
export type GuideCategory = 'all' | 'tavernas' | 'hotels' | 'archaeological';

export interface User {
  uid: string;
  name: string;
  email: string;
  avatar: string;
  searchesRemaining: number;
  isPremium: boolean;
  termsAccepted: boolean;
  isAdmin?: boolean;
  subscriptionPlan?: 'free' | SubscriptionPlan;
}

export interface TavernaRecommendation {
  id: string;
  rank?: number;
  name: string;
  englishName?: string;
  greekName: string;
  region: string;
  location: string;
  description: string;
  signatureDishes: string[];
  atmosphere: string;
  priceLevel: '€' | '€€' | '€€€';
  insiderTip: string;
  rating: number;
  officialWebsite?: string;
  imageUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface HotelRecommendation {
  id: string;
  rank?: number;
  name: string;
  englishName?: string;
  greekName: string;
  region: string;
  location: string;
  category: string;
  description: string;
  amenities: string[];
  priceLevel: '€' | '€€' | '€€€';
  insiderTip: string;
  rating: number;
  officialWebsite?: string;
  imageUrl?: string;
}

export interface ArchaeologicalSite {
  id: string;
  rank?: number;
  name: string;
  englishName?: string;
  greekName: string;
  region: string;
  location: string;
  era: string;
  description: string;
  highlights: string[];
  bestTimeToVisit: string;
  insiderTip: string;
  nearbyTavernaSuggestion: string;
  officialWebsite?: string;
  imageUrl?: string;
}

export interface DishRecommendation {
  id: string;
  rank?: number;
  name: string;
  englishName?: string;
  greekName: string;
  pronunciation: string;
  description: string;
  ingredients: string[];
  dietary: string[];
  regionOfOrigin: string;
  pairingDrink: string;
  imageUrl?: string;
}

export interface HiddenGemSpot {
  id: string;
  rank?: number;
  title: string;
  englishName?: string;
  greekTitle: string;
  region: string;
  description: string;
  whyVisit: string;
  bestTimeToVisit: string;
  nearbyTavernaSuggestion: string;
  officialWebsite?: string;
  imageUrl?: string;
}

export interface LocalPhrase {
  greek: string;
  phonetic: string;
  translation: string;
  meaning: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface MatchmakerResult {
  summary: string;
  guideCategory?: GuideCategory;
  tavernas: TavernaRecommendation[];
  hotels?: HotelRecommendation[];
  archaeologicalSites?: ArchaeologicalSite[];
  dishes: DishRecommendation[];
  hiddenGems: HiddenGemSpot[];
  localPhrases: LocalPhrase[];
  groundingSources?: GroundingSource[];
  searchedAt?: string;
}

export interface ItineraryDay {
  dayNumber: number;
  title: string;
  morning: string;
  lunchTaverna: string;
  afternoon: string;
  sunsetGem: string;
  dinnerAndStay: string;
  estimatedDailyCost: string;
}

export interface TripItinerary {
  city: string;
  headline: string;
  days: ItineraryDay[];
  budgetSummary: string;
}

export interface SearchHistoryRecord {
  id: string;
  userId: string;
  prompt: string;
  region: string;
  mood: string;
  dietary: string;
  language: Language;
  summary: string;
  createdAt: any;
}

export type FavoriteItemType = 'taverna' | 'hotel' | 'site' | 'dish' | 'gem';

export interface FavoriteItem {
  id: string;
  userId: string;
  itemType: FavoriteItemType;
  name: string;
  englishName: string;
  greekName: string;
  region: string;
  description: string;
  officialWebsite: string;
  imageUrl: string;
  priceLevel: string;
  createdAt?: any;
}

export interface VisionTranslationItem {
  originalText: string;
  phoneticGreek: string;
  translatedText: string;
  priceOrDetail: string;
  dietaryOrWarning: string;
}

export interface VisionTranslationResult {
  detectedCategory: string;
  detectedLanguage: string;
  headline: string;
  summaryTranslation: string;
  items: VisionTranslationItem[];
  replyPhraseGreek: string;
  replyPhrasePhonetic: string;
  replyPhraseTranslation: string;
}

export interface VoiceTranslationTurn {
  id: string;
  speaker: 'visitor' | 'local';
  sourceLanguage: string;
  targetLanguage: string;
  transcript: string;
  translatedText: string;
  greekPhonetic: string;
  culturalTip: string;
  timestamp: string;
}

export type ActiveTab =
  | 'matchmaker'
  | 'translator'
  | 'explore'
  | 'dishes'
  | 'hidden-gems'
  | 'favorites'
  | 'about'
  | 'terms';
