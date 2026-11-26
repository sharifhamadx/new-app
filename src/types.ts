export type Language = string;
export type Theme = 'light' | 'dark';
export type SubscriptionPlan = 'weekly_pass' | 'monthly' | 'annual';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type GuideCategory = 'all' | 'tavernas' | 'hotels' | 'archaeological';
export type AtmospherePreference =
  | 'any'
  | 'seaside'
  | 'beach'
  | 'quiet'
  | 'romantic'
  | 'traditional'
  | 'lively'
  | 'historic';

export type HealthConditionId =
  | 'diabetes'
  | 'hypertension'
  | 'heart_healthy'
  | 'celiac_gluten_free'
  | 'lactose_free'
  | 'nut_allergy'
  | 'seafood_allergy'
  | 'vegetarian'
  | 'halal'
  | 'mobility_accessible'
  | 'low_impact';

export interface HealthProfile {
  conditions: HealthConditionId[];
  allergiesOrNotes: string;
  updatedAt?: string;
}

export interface User {
  uid: string;
  name: string;
  email: string;
  avatar: string;
  searchesRemaining: number;
  isPremium: boolean;
  termsAccepted: boolean;
  isAdmin?: boolean;
  isGuest?: boolean;
  emailVerified?: boolean;
  approvalStatus?: ApprovalStatus;
  requestedPlan?: 'free' | SubscriptionPlan;
  paymentNote?: string;
  subscriptionPlan?: 'free' | SubscriptionPlan;
  planExpiresAt?: string | null;
  approvedBy?: string;
  approvedAt?: string | null;
  wellnessAddonActive?: boolean;
  wellnessAddonExpiresAt?: string | null;
  wellnessAddonRequested?: boolean;
  codeHint?: string | null;
  healthProfile?: HealthProfile;
}

export interface FirestoreUserRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  searchesRemaining: number;
  isPremium: boolean;
  subscriptionPlan: 'free' | SubscriptionPlan;
  approvalStatus: ApprovalStatus;
  requestedPlan: 'free' | SubscriptionPlan;
  subscriptionExpiresAt: string;
  paymentNote: string;
  approvedBy: string;
  approvedAt: string;
  wellnessAddonActive: boolean;
  wellnessAddonExpiresAt: string;
  wellnessAddonRequested: boolean;
  termsAccepted: boolean;
  createdAt: string;
  updatedAt: string;
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
  operatingStatus?: string;
  openingHours?: string;
  establishedYear?: string;
  officialWebsite?: string;
  bookingUrl?: string;
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
  operatingStatus?: string;
  openingHours?: string;
  establishedYear?: string;
  officialWebsite?: string;
  bookingUrl?: string;
  imageUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface NearbyPlaceRef {
  name: string;
  type?: string;
  distance?: string;
  note?: string;
  specialty?: string;
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
  nearbyHotels?: NearbyPlaceRef[];
  nearbyRestaurants?: NearbyPlaceRef[];
  operatingStatus?: string;
  openingHours?: string;
  officialWebsite?: string;
  bookingUrl?: string;
  imageUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
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
  operatingStatus?: string;
  openingHours?: string;
  officialWebsite?: string;
  bookingUrl?: string;
  imageUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
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
  healthFitNote?: string;
}

export interface ItineraryDay {
  dayNumber: number;
  title: string;
  morning: string;
  breakfastSpot?: string;
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

export interface CityLiveConditions {
  city: string;
  lat: number;
  lng: number;
  temperatureC: number;
  feelsLikeC: number;
  windKmh: number;
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
  sunrise: string;
  sunset: string;
  uvIndexMax: number;
  isIslandOrCoast: boolean;
  ferryUrl: string;
  officialTicketsUrl: string;
  fetchedAt: string;
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

export interface DailyPicksResult {
  dateKey: string;
  displayDate: string;
  focusCity: string;
  themeHeadline: string;
  healthAdaptationSummary: string;
  culinaryPick: TavernaRecommendation & {
    featuredDishName?: string;
    featuredDishGreek?: string;
    healthFitReason?: string;
  };
  dishPick: DishRecommendation & {
    healthFitReason?: string;
  };
  hotelPick: HotelRecommendation & {
    healthFitReason?: string;
  };
  tripPick: HiddenGemSpot & {
    healthFitReason?: string;
    tripCity?: string;
    estimatedDuration?: string;
  };
  groundingSources?: GroundingSource[];
  generatedAt: string;
}

export type WellnessGoalType = 'weight_loss' | 'weight_gain' | 'health_maintenance';
export type WellnessActivityLevel = 'light' | 'moderate' | 'active';

export interface WellnessMealEntry {
  mealType: string;
  venueOrSetting: string;
  dishName: string;
  greekDishName: string;
  foodCategory: string;
  portionGuide: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  healthBenefitNote: string;
}

export interface WellnessDaySchedule {
  dayNumber: number;
  dayTitle: string;
  morningPlaceAndActivity: string;
  afternoonPlaceAndActivity: string;
  eveningPlaceAndActivity: string;
  estimatedActiveBurnKcal: number;
  totalDailyCalories: number;
  hydrationLiters: number;
  dailyStepGoal: number;
  dailyWeightTrendNote: string;
  meals: WellnessMealEntry[];
}

export interface WellnessPlanRequest {
  destination: string;
  goalType: WellnessGoalType;
  durationDays: number;
  currentWeightKg: number;
  targetWeightKg?: number;
  dailyCalorieTarget?: number;
  activityLevel: WellnessActivityLevel;
  customGoalNotes?: string;
}

export interface WellnessPlanResult {
  headline: string;
  destination: string;
  goalType: WellnessGoalType;
  durationDays: number;
  summary: string;
  recommendedDailyCalories: number;
  estimatedDailyBurnCalories: number;
  dailyNetCalorieDelta: number;
  expectedTripWeightChangeKg: number;
  expectedTripWeightChangePercent: number;
  projectedMonthlyChangeKg: number;
  projectedMonthlyChangePercent: number;
  weightProjectionLabel: string;
  macroSplitSummary: string;
  healthAdaptationSummary: string;
  medicalSafetyNote: string;
  days: WellnessDaySchedule[];
  groundingSources?: GroundingSource[];
  generatedAt: string;
}

export type ActiveTab =
  | 'matchmaker'
  | 'wellness'
  | 'translator'
  | 'explore'
  | 'dishes'
  | 'hidden-gems'
  | 'favorites'
  | 'about'
  | 'terms';
