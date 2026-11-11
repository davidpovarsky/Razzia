/** Production CSS. Every selector is bounded by the explicit platform scope. */
const buttonBase =
  "display:inline-flex;align-items:center;justify-content:center;gap:var(--tds-button-gap);min-height:var(--tds-button-min-height);padding:var(--tds-space-2) var(--tds-space-4);border:1px solid var(--tds-border);border-radius:var(--tds-button-radius);background:var(--tds-elevated);color:var(--tds-text);font:var(--tds-weight-label) var(--tds-type-label)/1.3 var(--tds-font-family);text-decoration:none;cursor:pointer;transition:background var(--tds-motion-fast) var(--tds-motion-easing),box-shadow var(--tds-motion-fast) var(--tds-motion-easing),transform var(--tds-motion-fast) var(--tds-motion-easing)"
export const platformComponentCss = `
.tds-scope{font-family:var(--tds-font-family);color:var(--tds-text)}
.tds-scope[data-platform-appearance="dark"]{color-scheme:dark}
.tds-scope[data-platform-appearance="light"]{color-scheme:light}
.tds-scope .tds-button:not([data-variant="unstyled"]){${buttonBase};min-width:var(--tds-button-min-height)}
.tds-scope.tds-host-control-bar > :where(button),.tds-scope.tds-host-control-bar > div > :where(button),.tds-scope.tds-host-toolbar > div > :where(button[aria-pressed]),.tds-scope.tds-host-audio-controls button{${buttonBase}}
.tds-scope.tds-host-audio-controls input[type="range"]{accent-color:var(--tds-action);min-height:var(--tds-button-min-height);cursor:pointer}
.tds-scope.tds-host-audio-controls{flex-shrink:0}
.tds-scope.tds-host-control-bar :where(button):focus-visible,.tds-scope.tds-host-toolbar :where(button[aria-pressed]):focus-visible,.tds-scope.tds-host-audio-controls :where(button,input):focus-visible{outline:2px solid var(--tds-focus);outline-offset:var(--tds-space-1)}
.tds-scope.tds-host-toolbar[data-host-lobby="true"] .tds-host-previous:disabled{display:none}
@media(max-width:48rem){.tds-scope .tds-host-display-label{display:none}}
.tds-scope .tds-button[data-variant="primary"]{background:var(--tds-action);color:var(--tds-action-text);border-color:transparent}
.tds-scope .tds-button[data-variant="destructive"]{background:var(--tds-danger);color:var(--tds-danger-text);border-color:transparent}
.tds-scope .tds-button[data-variant="ghost"]{background:transparent;border-color:transparent}
.tds-scope .tds-button:not([data-variant="unstyled"]):not(:disabled):hover{box-shadow:var(--tds-shadow-raised);filter:brightness(1.08)}
.tds-scope .tds-button:not([data-variant="unstyled"]):not(:disabled):active{transform:translateY(1px)}
.tds-scope .tds-button:disabled{opacity:.55;cursor:not-allowed}
.tds-scope :is(.tds-button,.tds-input,.tds-select,.tds-switch,.tds-tab,.tds-menu-item,.tds-legacy-surface [role="switch"]):focus-visible{outline:2px solid var(--tds-focus);outline-offset:var(--tds-space-1)}
.tds-scope .tds-button[data-size="sm"]{padding-inline:var(--tds-space-3)}
.tds-scope .tds-button[data-size="lg"]{min-height:calc(var(--tds-button-min-height) + var(--tds-space-2));font-size:var(--tds-type-body)}
.tds-scope .tds-button-content{display:inline-flex;align-items:center;justify-content:center;gap:inherit;min-width:0}
.tds-scope .tds-icon-button:not([data-variant="unstyled"]){width:var(--tds-button-min-height);padding:var(--tds-space-2);flex-shrink:0}
.tds-scope .tds-spinner{display:inline-block;width:var(--tds-icon-small);height:var(--tds-icon-small);border:2px solid currentColor;border-inline-end-color:transparent;border-radius:var(--tds-radius-round);animation:tds-spin var(--tds-motion-spinner) linear infinite}
@keyframes tds-spin{to{transform:rotate(360deg)}}
.tds-scope .tds-field{display:grid;gap:var(--tds-space-2);min-width:0}
.tds-scope .tds-field-label{font-size:var(--tds-type-label);font-weight:var(--tds-weight-label)}
.tds-scope :is(.tds-input,.tds-select){box-sizing:border-box;width:100%;min-width:0;min-height:var(--tds-input-min-height);padding:var(--tds-space-2) var(--tds-space-3);border:1px solid var(--tds-border);border-radius:var(--tds-input-radius);color:var(--tds-text);background:var(--tds-surface);font:inherit}
.tds-scope .tds-input::placeholder{color:var(--tds-muted-text);opacity:1}
.tds-scope :is(.tds-input,.tds-select)[aria-invalid="true"]{border-color:var(--tds-danger)}
.tds-scope :is(.tds-input,.tds-select):disabled{opacity:.55;cursor:not-allowed}
.tds-scope .tds-description{color:var(--tds-muted-text);font-size:var(--tds-type-label);line-height:1.5}
.tds-scope .tds-field-error{color:var(--tds-danger);font-size:var(--tds-type-label)}
.tds-scope .tds-switch-row{display:flex;align-items:center;gap:var(--tds-space-3);min-height:var(--tds-button-min-height);cursor:pointer;font-size:var(--tds-type-label)}
.tds-scope :is(.tds-switch,.tds-legacy-surface [role="switch"]){position:relative;width:var(--tds-switch-width);height:var(--tds-switch-height);border:1px solid var(--tds-border);border-radius:var(--tds-radius-round);background:var(--tds-elevated);flex-shrink:0;cursor:pointer}
.tds-scope :is(.tds-switch,.tds-legacy-surface [role="switch"])[data-state="checked"]{background:var(--tds-action)}
.tds-scope :is(.tds-switch,.tds-legacy-surface [role="switch"]):disabled{opacity:.55;cursor:not-allowed}
.tds-scope :is(.tds-switch-thumb,.tds-legacy-surface [role="switch"] > span){display:block;position:absolute;inset-block-start:var(--tds-switch-offset);inset-inline-start:var(--tds-switch-offset);width:var(--tds-switch-thumb-size);height:var(--tds-switch-thumb-size);background:var(--tds-text);border-radius:var(--tds-radius-round);transform:none;translate:none;transition:inset-inline-start var(--tds-motion-fast) var(--tds-motion-easing)}
.tds-scope :is(.tds-switch[data-state="checked"] .tds-switch-thumb,.tds-legacy-surface [role="switch"][data-state="checked"] > span){inset-inline-start:calc(100% - var(--tds-switch-thumb-size) - var(--tds-switch-offset));background:var(--tds-action-text)}
.tds-scope.tds-legacy-surface [role="switch"]::after{content:"";position:absolute;inset-inline:0;inset-block-start:calc((var(--tds-switch-height) - var(--tds-button-min-height)) / 2);height:var(--tds-button-min-height)}
.tds-scope .tds-tabs-list{display:flex;flex-wrap:wrap;gap:var(--tds-space-1);padding:var(--tds-space-1);border:1px solid var(--tds-border);border-radius:var(--tds-radius-control);background:var(--tds-surface)}
.tds-scope .tds-tab{min-height:var(--tds-button-min-height);padding:var(--tds-space-2) var(--tds-space-4);background:transparent;color:var(--tds-muted-text);border:0;border-radius:var(--tds-radius-small);font:inherit;cursor:pointer}
.tds-scope .tds-tab[data-state="active"]{background:var(--tds-action);color:var(--tds-action-text);font-weight:var(--tds-weight-label)}
.tds-scope .tds-tab:disabled{opacity:.55;cursor:not-allowed}
.tds-scope .tds-tab-panel{padding-block:var(--tds-space-4)}
.tds-scope .tds-card{min-width:0;padding:var(--tds-space-6);border:1px solid var(--tds-border);border-radius:var(--tds-radius-card);background:var(--tds-surface);color:var(--tds-text)}
.tds-scope .tds-badge{display:inline-flex;align-items:center;gap:var(--tds-space-1);border:1px solid currentColor;border-radius:var(--tds-radius-round);padding:var(--tds-space-1) var(--tds-space-2);font-size:var(--tds-type-caption);font-weight:var(--tds-weight-label);color:var(--tds-muted-text)}
.tds-scope [data-tone="success"]{color:var(--tds-success)}
.tds-scope [data-tone="warning"]{color:var(--tds-warning)}
.tds-scope [data-tone="danger"]{color:var(--tds-danger)}
.tds-scope [data-tone="info"]{color:var(--tds-info)}
.tds-scope .tds-state{display:grid;justify-items:start;gap:var(--tds-space-3);padding:var(--tds-space-6);border:1px solid var(--tds-border);border-radius:var(--tds-radius-card);background:var(--tds-surface)}
.tds-scope .tds-state h3{margin:0;font-size:var(--tds-type-title);font-weight:var(--tds-weight-heading)}
.tds-scope .tds-state p{margin:0;color:var(--tds-muted-text)}
.tds-scope .tds-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--tds-space-2);min-width:0}
.tds-scope .tds-toolbar-group{display:inline-flex;flex-wrap:wrap;align-items:center;gap:var(--tds-space-1);padding:var(--tds-space-1);border:1px solid var(--tds-border);border-radius:var(--tds-radius-control)}
.tds-scope .tds-table-scroll{max-height:60dvh;overflow:auto;border:1px solid var(--tds-border);border-radius:var(--tds-radius-control)}
.tds-scope .tds-table{width:100%;border-collapse:collapse;text-align:start;font-size:var(--tds-type-label)}
.tds-scope .tds-table caption{text-align:start;padding:var(--tds-space-3);font-weight:var(--tds-weight-label)}
.tds-scope .tds-table thead{position:sticky;inset-block-start:0;z-index:1;background:var(--tds-elevated)}
.tds-scope .tds-table :is(th,td){padding:var(--tds-space-3);border-block-end:1px solid var(--tds-border);text-align:start;min-height:var(--tds-table-row-min-height)}
.tds-scope .tds-overlay{position:fixed;inset:0;z-index:var(--tds-z-overlay);background:var(--tds-overlay);backdrop-filter:blur(5px)}
.tds-scope .tds-dialog-surface{box-sizing:border-box;position:fixed;inset-block-start:50%;inset-inline-start:50%;transform:translate(-50%,-50%);z-index:var(--tds-z-dialog);width:min(var(--tds-dialog-width),calc(100vw - var(--tds-space-8)));max-height:var(--tds-dialog-max-height);overflow:auto;overscroll-behavior:contain;margin:0;border:1px solid var(--tds-border);border-radius:var(--tds-radius-dialog);padding:var(--tds-dialog-padding);background:var(--tds-surface);color:var(--tds-text);font-family:var(--tds-font-family);box-shadow:var(--tds-shadow-dialog)}
.tds-scope[dir="rtl"] .tds-dialog-surface{inset-inline-start:auto;left:50%}
.tds-scope dialog.tds-dialog-surface::backdrop{background:var(--tds-overlay);backdrop-filter:blur(5px)}
.tds-scope .tds-dialog-title{margin:0;padding-inline-end:calc(var(--tds-button-min-height) + var(--tds-space-3));font-size:var(--tds-type-title);font-weight:var(--tds-weight-heading);line-height:1.3}
.tds-scope .tds-dialog-description{margin-block:var(--tds-space-3);color:var(--tds-muted-text);line-height:1.5}
.tds-scope .tds-dialog-close{position:absolute;inset-block-start:var(--tds-space-3);inset-inline-end:var(--tds-space-3)}
.tds-scope .tds-dialog-body{display:grid;gap:var(--tds-space-4);margin-block-start:var(--tds-space-4);min-height:0}
.tds-scope .tds-dialog-body>.tds-button{justify-self:start}
.tds-scope .tds-dialog-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--tds-space-2);margin-block-start:var(--tds-space-6)}
.tds-scope .tds-menu-surface{z-index:var(--tds-z-menu);min-width:12rem;max-width:calc(100vw - var(--tds-space-8));max-height:min(70dvh,var(--radix-dropdown-menu-content-available-height,70dvh));overflow:auto;padding:var(--tds-space-2);border:1px solid var(--tds-border);border-radius:var(--tds-radius-control);background:var(--tds-surface);color:var(--tds-text);font-family:var(--tds-font-family);box-shadow:var(--tds-shadow-raised)}
.tds-scope .tds-menu-item{display:flex;align-items:center;gap:var(--tds-space-2);min-height:var(--tds-button-min-height);padding:var(--tds-space-2) var(--tds-space-3);border-radius:var(--tds-radius-small);font-size:var(--tds-type-label);cursor:pointer;outline:none}
.tds-scope .tds-menu-item[data-highlighted]{background:var(--tds-elevated)}
.tds-scope .tds-menu-item[data-disabled]{opacity:.55;cursor:not-allowed}
.tds-scope .tds-menu-separator{height:1px;margin-block:var(--tds-space-2);background:var(--tds-border)}
.tds-scope .tds-tooltip{z-index:var(--tds-z-tooltip);max-width:20rem;padding:var(--tds-space-2) var(--tds-space-3);border:1px solid var(--tds-border);border-radius:var(--tds-radius-small);background:var(--tds-elevated);color:var(--tds-text);font:var(--tds-type-label)/1.4 var(--tds-font-family);box-shadow:var(--tds-shadow-raised)}
.tds-scope .tds-toast{padding:var(--tds-space-4);border:1px solid var(--tds-border);border-radius:var(--tds-radius-control);background:var(--tds-elevated);color:var(--tds-text);box-shadow:var(--tds-shadow-raised)}
.tds-scope.tds-portal-scope{display:contents}
.tds-scope.tds-legacy-surface{--color-primary:var(--tds-action);--color-secondary:var(--tds-action-text);--color-background:var(--tds-surface);--color-foreground:var(--tds-text);--color-muted:var(--tds-elevated);--color-muted-foreground:var(--tds-muted-text);--color-accent:var(--tds-elevated);--color-accent-foreground:var(--tds-text);--color-border:var(--tds-border)}
.tds-scope.tds-legacy-surface :is([role="dialog"],[role="alertdialog"]){background:var(--tds-surface);color:var(--tds-text);font-family:var(--tds-font-family);border:1px solid var(--tds-border);border-radius:var(--tds-radius-dialog);box-shadow:var(--tds-shadow-dialog)}
.tds-scope.tds-legacy-surface button[aria-label]:not([role="switch"]){min-width:var(--tds-button-min-height);min-height:var(--tds-button-min-height)}
.tds-scope.tds-legacy-surface :is([class*="text-neutral-"],[class*="text-gray-"]){color:var(--tds-muted-text)}
.tds-scope.tds-legacy-surface :is(.bg-white,[class*="bg-neutral-"],[class*="bg-gray-"]){background-color:var(--tds-elevated)}
@media(prefers-reduced-motion:reduce){.tds-scope .tds-spinner{animation:none}.tds-scope .tds-button:not(:disabled):active{transform:none}}
`
