/** New platform refinements are scoped, token-based and never enter the editor. */
export const sitePlatformStyle = `
.tds-scope .site-game-media{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;align-self:start}
.tds-scope .site-game-cover,.tds-scope .site-game-list .site-game-cover{display:block;width:100%;height:100%;aspect-ratio:16/9;object-fit:cover}
.tds-scope .site-cover-label{position:absolute;inset-inline-start:var(--tds-space-3);inset-block-end:var(--tds-space-3);padding:var(--tds-space-1) var(--tds-space-2);border:1px solid var(--tds-border);border-radius:var(--tds-radius-round);color:var(--tds-muted-text);background:var(--tds-surface);font-size:var(--tds-type-caption)}
.tds-scope .site-game-body{min-width:0;padding:var(--tds-space-5)}
.tds-scope .site-game-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--tds-space-2)}
.tds-scope .site-game-heading h3{min-width:0;flex:1;margin:0;overflow-wrap:anywhere}
.tds-scope .site-game-heading>.tds-button{flex-shrink:0}
.tds-scope .site-game-body .button-row .btn{min-height:var(--tds-button-min-height);white-space:normal;text-align:center}
.tds-scope .site-game-list .game-card{display:grid;grid-template-columns:180px minmax(0,1fr);align-items:start;overflow:hidden}
.tds-scope .site-games-empty{grid-column:1/-1}
.tds-scope .list-toolbar .tds-field{min-width:10rem}
.tds-scope .list-toolbar .tds-select{margin:0}
.tds-scope .site-package-tools>details{border:1px solid var(--tds-border);border-radius:var(--tds-radius-card);background:var(--tds-surface);padding:var(--tds-space-4)}
.tds-scope .site-package-tools summary{color:var(--tds-text);min-height:var(--tds-button-min-height);padding:var(--tds-space-2);cursor:pointer}
.tds-scope .site-package-tools summary span{display:block;color:var(--tds-muted-text);font-size:var(--tds-type-label);margin-block-start:var(--tds-space-1)}
.tds-scope .site-package-tools details[open]>summary{margin-block-end:var(--tds-space-4)}
.tds-scope .site-account-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:var(--tds-space-5);max-width:72rem}
.tds-scope .site-account-card{display:grid;gap:var(--tds-space-4)}
.tds-scope .site-account-card :is(h2,p){margin:0;overflow-wrap:anywhere}
.tds-scope .site-account-card h2{font-size:var(--tds-type-title)}
.tds-scope .site-account-card .tds-badge,.tds-scope .site-account-card>.btn{justify-self:start}
.tds-scope .site-account-card select{margin:0}
.tds-scope .side-identity{display:flex;align-items:center;gap:var(--tds-space-3);padding:var(--tds-space-3);font-size:var(--tds-type-caption);color:var(--tds-muted-text);overflow-wrap:anywhere}
.tds-scope .side-identity>span:last-child{min-width:0}
.tds-scope .top-actions>.avatar{display:none}
.tds-scope .demo-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--tds-space-4);margin-block:var(--tds-space-6)}
.tds-scope .demo-choice{display:flex;align-items:center;gap:var(--tds-space-3);min-height:5rem;padding:var(--tds-space-4);border:1px solid var(--tds-border);border-radius:var(--tds-radius-card);background:var(--tds-surface);color:var(--tds-text);font-size:var(--tds-type-body);font-weight:var(--tds-weight-label);text-align:start;cursor:pointer}
.tds-scope .demo-choice[aria-pressed="true"]{border-color:var(--tds-action);box-shadow:var(--tds-shadow-focus);background:var(--tds-elevated)}
.tds-scope .demo-choice-number{display:grid;place-items:center;flex-shrink:0;min-width:var(--tds-space-8);min-height:var(--tds-space-8);border:1px solid var(--tds-border);border-radius:var(--tds-radius-round);color:var(--tds-action)}
@media(max-width:900px){.tds-scope .site-game-list .game-card{grid-template-columns:140px minmax(0,1fr)}}
@media(max-width:768px){.tds-scope .site-account-grid{grid-template-columns:minmax(0,1fr)}.tds-scope .top-actions>.avatar{display:grid}.tds-scope .demo-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:480px){.tds-scope .site-game-list .game-card{display:block}.tds-scope .demo-choice-grid{grid-template-columns:minmax(0,1fr)}}
`
