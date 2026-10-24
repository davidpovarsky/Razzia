/**
 * @razzia/extensions/telephony
 * Public API for Provider-Neutral Offline Simulated Telephony in Razzia.
 */

export {
  TELEPHONY_CONSTANTS,
  SESSION_STATES,
  type SessionState,
  type TelephonyDirective,
  type InboundWebhookRequest,
  type WebhookVerificationResult,
  type TelephonyEvent,
  type TelephonyResult,
  type TelephonyCallSession,
  redactPhoneNumber,
  telephonyLogger,
  pinValidator,
  isValidPin,
  mapDtmfToAnswerIndex,
  isQuestionSupportedOnPstn,
} from "./types"

export { type TelephonyProvider, ProviderRegistry } from "./provider"

export {
  MockProvider,
  type MockProviderOptions,
  computeMockHmac,
  safeCompareSignatures,
} from "./mock-provider"

export {
  YemotApiTranslator,
  type YemotCallbackData,
  type YemotTranslatorOptions,
} from "./yemot-translator"

export {
  type HttpClient,
  type SocketConnection,
  type SocketEventHandler,
  type SocketFactory,
  type RazziaTransport,
  MockRazziaTransport,
  MockSocketConnection,
  type MockGameConfig,
  type MockQuestionState,
  type MockPlayerAnswerRecord,
} from "./transport"

export {
  RazziaSocketClient,
  type RazziaSocketClientConfig,
  type ClientGameState,
  type StateChangeCallback,
} from "./socket-client"

export { TelephonyBridge, type TelephonyBridgeOptions } from "./bridge"

export {
  KeypadSimulatorCore,
  type SimulatorDisplayState,
  type SimulatorDisplayListener,
} from "./simulator"

export { KeypadSimulator, type KeypadSimulatorProps } from "./KeypadSimulator"
