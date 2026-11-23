/** Shared viewer chrome. Native stage art and typography stay inside the stage. */
export const gameViewerCss = `
.game-viewer-dialog {
  box-sizing: border-box;
  color: var(--tds-text, #fff);
  background: var(--tds-surface, #1d1130);
  border: 0;
  padding: 0;
  font: inherit;
  text-align: start;
}
.game-viewer-dialog:not([open]) {
  display: none;
}
.game-viewer-dialog[open][data-expanded="false"] {
  display: block;
  position: relative;
  inset: auto;
  inline-size: 100%;
  max-inline-size: none;
  block-size: auto;
  max-block-size: none;
  margin: 0;
  overflow: visible;
}
.game-viewer-dialog[open][data-expanded="true"] {
  display: block;
  position: fixed;
  inset: 0;
  inline-size: calc(100vw - 24px);
  max-inline-size: none;
  block-size: fit-content;
  max-block-size: calc(100dvh - 24px);
  margin: auto;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--tds-border, #654579);
  border-radius: 16px;
  box-shadow: var(--tds-shadow-dialog, 0 24px 80px #0009);
}
.game-viewer-dialog::backdrop {
  background: var(--tds-overlay, #070312b3);
  backdrop-filter: blur(5px);
}
.game-viewer {
  --game-viewer-stage-reserve: 144px;
  box-sizing: border-box;
  min-inline-size: 0;
  inline-size: 100%;
  overflow: hidden;
  border: 1px solid var(--tds-border, #654579);
  border-radius: 16px;
  background: var(--tds-surface, #1d1130);
  color: var(--tds-text, #fff);
}
.game-viewer:has(> .game-viewer-details) {
  --game-viewer-stage-reserve: 188px;
}
.game-viewer[data-expanded="true"] {
  border: 0;
  border-radius: 0;
}
.game-viewer-header {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-inline-size: 0;
  min-block-size: 52px;
  padding: 4px 12px;
  border-block-end: 1px solid var(--tds-border, #654579);
}
.game-viewer-heading {
  flex: 1;
  min-inline-size: 0;
  text-align: start;
}
.game-viewer-heading :is(h1, h2, h3, p) {
  margin: 0;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.game-viewer-heading :is(h1, h2, h3) {
  color: var(--tds-text, #fff);
  font: 700 18px/24px var(--tds-font-family, system-ui);
  letter-spacing: normal;
}
.game-viewer-heading :is(p, small, [role="status"]) {
  display: block;
  color: var(--tds-muted-text, #c6b7d8);
  font-size: 12px;
  line-height: 16px;
}
.game-viewer-header > .tds-presentation-controls {
  flex: 0 0 auto;
}
.game-viewer-stage {
  position: relative;
  isolation: isolate;
  display: block;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 0;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #09021c;
  margin-inline: auto;
}
.game-viewer-stage > :not(style, .game-preview-message) {
  inline-size: 100%;
  block-size: 100%;
  min-inline-size: 0;
  min-block-size: 0;
}
.game-viewer-stage :is(.catalogue-player-frame, .ggo-native-frame) {
  inline-size: 100%;
  block-size: 100%;
  aspect-ratio: auto;
}
.game-viewer[data-expanded="true"] > .game-viewer-stage,
.catalogue-viewer-page .game-viewer > .game-viewer-stage {
  inline-size: min(100%, calc((100dvh - var(--game-viewer-stage-reserve)) * 16 / 9));
}
.game-viewer-controls {
  box-sizing: border-box;
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  padding: 6px 12px;
  border-block-start: 1px solid var(--tds-border, #654579);
  background: var(--tds-surface, #1d1130);
}
.game-viewer-controls > .tds-presentation-controls {
  justify-content: center;
}
.game-viewer-controls .catalogue-mobile-question {
  margin-block: 0 8px;
}
.game-viewer-details {
  min-inline-size: 0;
  border-block-start: 1px solid var(--tds-border, #654579);
  padding-inline: 12px;
  color: var(--tds-muted-text, #c6b7d8);
  font-size: 14px;
  line-height: 1.5;
}
.game-viewer-details > summary {
  box-sizing: border-box;
  min-block-size: 44px;
  padding-block: 11px;
  color: var(--tds-text, #fff);
  cursor: pointer;
}
.game-viewer-details > summary:focus-visible {
  outline: 2px solid var(--tds-focus, #e7ff37);
  outline-offset: -2px;
  border-radius: 4px;
}
.game-viewer-details[open] {
  padding-block-end: 12px;
}
.game-viewer-details :is(p, .button-row, .product-actions) {
  margin-block: 8px;
}
.game-viewer-details :is(p, li) {
  overflow-wrap: anywhere;
}
@media (max-width: 700px) {
  .game-viewer-dialog[open][data-expanded="true"] {
    inline-size: calc(100vw - 12px);
    max-block-size: calc(100dvh - 12px);
    border-radius: 10px;
  }
  .game-viewer {
    border-radius: 10px;
  }
  .game-viewer-header {
    gap: 8px;
    padding-inline: 8px;
  }
  .game-viewer-heading :is(h1, h2, h3) {
    font-size: 16px;
    line-height: 22px;
  }
  .game-viewer-controls {
    padding-inline: 8px;
  }
}
@media (max-height: 500px) and (orientation: landscape) {
  .game-viewer[data-expanded="true"] > .game-viewer-stage,
  .catalogue-viewer-page .game-viewer > .game-viewer-stage {
    inline-size: min(100%, calc((100dvh - 144px) * 16 / 9));
  }
  .game-viewer-heading :is(p, small, [role="status"]) {
    display: none;
  }
}
`
