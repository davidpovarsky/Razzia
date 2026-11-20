export const gamePreviewCss = `
.game-preview-surface{position:relative;width:100%;min-width:0;isolation:isolate;overflow:hidden;border-radius:inherit;--preview-surface:var(--tds-surface,#fff);--preview-text:var(--tds-text,#202939);--preview-border:var(--tds-border,#cbd2dd);--preview-action:var(--tds-action,#e87700)}
.game-preview-poster[aria-hidden=true]{visibility:hidden}
.game-preview-cover-action{display:block!important;width:100%;padding:0!important;border:0!important;text-align:inherit;color:inherit;background:transparent}
.game-preview-overlay{position:absolute;inset:0;background:var(--preview-surface);color:var(--preview-text);overflow:hidden;z-index:2}
.game-preview-overlay[hidden]{display:none}
.game-preview-stage{position:absolute;inset:0}
.game-preview-stage>*{width:100%;height:100%}
.game-preview-trigger{position:absolute;inset-block-end:.5rem;inset-inline-end:.5rem;display:flex;align-items:center;gap:.25rem;min-height:44px;background:var(--preview-surface)!important;color:var(--preview-text)!important;border-radius:var(--tds-radius-button,.5rem);padding:.5rem!important}
.game-preview-message{position:absolute;inset:20% .75rem;display:grid;place-content:center;text-align:center;overflow:auto;margin:0}
.game-preview-bottom{display:flex;align-items:center;gap:12px;min-width:0;width:100%;color:var(--preview-text)}
.game-preview-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.game-preview-actions>span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.game-preview-audition{display:flex;align-items:end;flex-wrap:wrap;gap:8px;min-width:0;font-size:14px}
.game-preview-audition>label{display:grid;gap:6px;flex:1 1 14rem;min-width:0}
.game-preview-audition select{width:100%;min-width:0;min-height:44px;margin:0;color:inherit;background:var(--preview-surface);border:1px solid var(--preview-border);padding:6px;border-radius:4px}
.game-preview-timeline{position:relative;flex:1 1 12rem;min-width:0}
.game-preview-timeline input{display:block;width:100%;height:20px;margin:0;touch-action:none;cursor:pointer;accent-color:var(--preview-action)}
.game-preview-timeline input:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.game-preview-timeline output{display:block;font-size:11px;line-height:14px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.game-preview-segments{display:flex;gap:2px;height:3px}
.game-preview-segments span{flex:1;background:var(--preview-border)}
.game-preview-segments span[data-passed]{background:var(--preview-action)}
@media(max-width:700px){.game-preview-bottom{flex-wrap:wrap;gap:6px}.game-preview-timeline{flex-basis:100%}.game-preview-bottom>.tds-presentation-controls{justify-content:center;width:100%}}
`
