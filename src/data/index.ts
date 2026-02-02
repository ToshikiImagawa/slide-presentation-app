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
  PresenterViewMessage,
  ThemeData,
  ColorPalette,
  FontDefinition,
  FontSource,
  ValidationError,
} from './types'

export { loadPresentationData, validatePresentationData, getValidationErrors, defaultPresentationData } from './loader'

export { normalizeNotes, getSpeakerNotes, getSlideSummary } from './noteHelpers'
