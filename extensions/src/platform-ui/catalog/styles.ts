export const catalogCss = `
.tds-catalog{min-height:100dvh;background:var(--tds-background);font-size:var(--tds-type-body);line-height:1.6}
.tds-catalog .catalog-header{padding:var(--tds-space-5) var(--tds-space-6);border-block-end:1px solid var(--tds-border);background:var(--tds-surface)}
.tds-catalog .catalog-row{display:flex;align-items:center;flex-wrap:wrap;gap:var(--tds-space-3)}
.tds-catalog .catalog-header nav{margin-block-start:var(--tds-space-3)}
.tds-catalog a{color:var(--tds-action);text-underline-offset:var(--tds-space-1)}
.tds-catalog a:focus-visible{outline:2px solid var(--tds-focus);outline-offset:var(--tds-space-1)}
.tds-catalog .catalog-skip:not(:focus){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.tds-catalog .catalog-main{max-width:90rem;margin-inline:auto;padding:var(--tds-space-6);box-sizing:border-box}
.tds-catalog h1{font-size:var(--tds-type-display);line-height:1.15;max-width:60rem}
.tds-catalog h2{margin-block-start:var(--tds-space-12);font-size:var(--tds-type-title)}
.tds-catalog h3{margin-block-start:0;font-size:var(--tds-type-body)}
.tds-catalog :is(code,pre){font-family:var(--tds-font-mono);font-size:var(--tds-type-caption);overflow-wrap:anywhere}
.tds-catalog pre{white-space:pre-wrap}
.tds-catalog .catalog-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--tds-space-4);padding:var(--tds-space-5);border:1px solid var(--tds-border);border-radius:var(--tds-radius-card);background:var(--tds-surface)}
.tds-catalog .catalog-palette{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:var(--tds-space-3)}
.tds-catalog .catalog-swatch{display:grid;gap:var(--tds-space-1);border:1px solid var(--tds-border);padding:var(--tds-space-3);border-radius:var(--tds-radius-control);background:var(--tds-surface)}
.tds-catalog .catalog-swatch>span{display:block;height:var(--tds-space-8);border:1px solid var(--tds-border);border-radius:var(--tds-radius-small)}
.tds-catalog .catalog-foundations{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--tds-space-4);margin-block:var(--tds-space-6)}
.tds-catalog summary{cursor:pointer;min-height:var(--tds-button-min-height);font-weight:var(--tds-weight-label)}
.tds-catalog dl>div{display:flex;justify-content:space-between;gap:var(--tds-space-2)}
.tds-catalog dd{margin:0}
.tds-catalog .catalog-type-samples{padding:var(--tds-space-5);border:1px solid var(--tds-border);border-radius:var(--tds-radius-card);overflow-wrap:anywhere}
.tds-catalog .catalog-type-samples p{margin-block:var(--tds-space-3)}
.tds-catalog .catalog-stories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--tds-space-5)}
.tds-catalog .catalog-example{display:grid;gap:var(--tds-space-4);margin-block:var(--tds-space-5)}
.tds-catalog .catalog-example>.tds-button{justify-self:start}
.tds-catalog .catalog-description{color:var(--tds-muted-text);font-size:var(--tds-type-label)}
.tds-catalog .catalog-layout-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--tds-space-4);margin-block-start:var(--tds-space-5)}
.tds-catalog #layouts>.tds-card{margin-block:var(--tds-space-4)}
@media(max-width:900px){.tds-catalog .catalog-stories,.tds-catalog .catalog-layout-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:480px){.tds-catalog .catalog-main,.tds-catalog .catalog-header{padding:var(--tds-space-4)}.tds-catalog .catalog-controls{padding:var(--tds-space-3)}}
`
