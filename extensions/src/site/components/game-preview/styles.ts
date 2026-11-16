export const gamePreviewCss = `
.game-preview-surface{position:relative;width:100%;isolation:isolate;overflow:hidden;border-radius:inherit;--preview-surface:var(--tds-surface,#fff);--preview-text:var(--tds-text,#202939);--preview-border:var(--tds-border,#cbd2dd);--preview-action:var(--tds-action,#e87700)}
.game-preview-poster[aria-hidden=true]{visibility:hidden}
.game-preview-cover-action{display:block!important;width:100%;padding:0!important;border:0!important;text-align:inherit;color:inherit;background:transparent}
.game-preview-overlay{position:absolute;inset:0;background:var(--preview-surface);color:var(--preview-text);overflow:hidden;z-index:2}
.game-preview-overlay[hidden]{display:none}.game-preview-stage{position:absolute;inset:0 0 46px}.game-preview-stage>*{width:100%;height:100%}
.game-preview-topbar{position:absolute;inset:0 0 auto;display:flex;align-items:start;justify-content:space-between;padding:3px;gap:4px;pointer-events:none}.game-preview-topbar>span{font-size:10px;line-height:16px;padding:0 4px;background:color-mix(in srgb,var(--preview-surface) 88%,transparent);border-radius:4px;max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.game-preview-topbar>button{pointer-events:auto}
.game-preview-topbar button,.game-preview-actions button{width:30px!important;height:30px!important;min-width:30px!important;min-height:30px!important;padding:4px!important}.game-preview-topbar button svg,.game-preview-actions button svg{width:18px;height:18px}
.game-preview-trigger{position:absolute;inset:auto .5rem .5rem auto;display:flex;align-items:center;gap:.25rem;background:var(--preview-surface)!important;color:var(--preview-text)!important;border-radius:var(--tds-radius-button,.5rem);padding:.5rem!important}
.game-preview-message{position:absolute;inset:28% .75rem 15%;display:grid;place-content:center;text-align:center;overflow:auto;margin:0}
.game-preview-bottom{position:absolute;inset:auto 0 0;display:flex;align-items:center;gap:6px;height:46px;padding:4px;background:var(--preview-surface);color:var(--preview-text)}
.game-preview-actions{display:flex;align-items:center;gap:4px}.game-preview-actions>span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.game-preview-audition{position:relative;font-size:11px;flex-shrink:0}.game-preview-audition summary{cursor:pointer;padding:6px}.game-preview-audition>div{position:absolute;right:0;bottom:calc(100% + 8px);width:min(280px,65vw);display:flex;flex-wrap:wrap;gap:6px;background:var(--preview-surface);color:var(--preview-text);border:1px solid var(--preview-border);border-radius:8px;padding:8px;z-index:4}.game-preview-audition select{width:100%;color:inherit;background:var(--preview-surface);border:1px solid var(--preview-border);padding:6px;border-radius:4px}
.game-preview-timeline{position:relative;flex:1;min-width:0}.game-preview-timeline input{display:block;width:100%;height:24px;margin:0;touch-action:none;cursor:pointer;accent-color:var(--preview-action)}
.game-preview-bottom:has(.game-preview-timeline input~input){height:70px}.game-preview-surface:has(.game-preview-timeline input~input) .game-preview-stage{bottom:70px}
.game-preview-timeline input:focus-visible{outline:2px solid currentColor;outline-offset:2px}.game-preview-timeline output{display:block;font-size:9px;line-height:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.game-preview-segments{display:flex;gap:2px;height:3px}.game-preview-segments span{flex:1;background:var(--preview-border)}.game-preview-segments span[data-passed]{background:var(--preview-action)}
`
