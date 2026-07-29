export type {
  PresentationData,
  PresentationMeta,
  SlideData,
  SlideContent,
  ContentItem,
  ComponentReference,
  SlideMeta,
  SlideNotes,
  PresenterSlideState,
  PresenterControlState,
  PresenterProgressState,
  PresenterViewMessage,
  ThemeData,
  ColorPalette,
  FontDefinition,
  FontSource,
  ValidationError,
} from './types'

export { loadPresentationData, validatePresentationData, getValidationErrors, getFallbackPresentationData, getSampleUnavailablePresentationData, getBlankPresentationData } from './loader'

export { normalizeNotes, getSpeakerNotes, getSlideSummary } from './noteHelpers'
