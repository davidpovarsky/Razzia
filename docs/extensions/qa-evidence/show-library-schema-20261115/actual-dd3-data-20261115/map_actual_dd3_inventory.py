"""Read committed UI/Git/ZIP data only; no project/runtime/build/server imports.
Generates diagnostic DATA and explicit partial mappings, never an active index/pin.
"""
from pathlib import Path
from io import BytesIO
import argparse,base64,hashlib,json,re,subprocess,zipfile
UI_SOURCE="dd3cd1347981ac6fd934f90d870ff57bba82d470"
UI_EVIDENCE="a2625d3b9e9df3787edad4abf4d9bdb6ad890125"
UI_OUTPUT_PROOF="7240e858087008bed1293856c03c8c9a80dadd91"
PREFIX="docs/extensions/qa-evidence/show-ui-20261115/"
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode("utf-8")
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--ui-repo",required=True);args=ap.parse_args()
 repo=Path(args.ui_repo).resolve();out=Path(__file__).resolve().parent;inputs=out/"inputs";inputs.mkdir(exist_ok=True)
 def git_bytes(commit,path):return subprocess.check_output(["git","show",commit+":"+path],cwd=repo)
 def git_source(path):
  b=git_bytes(UI_SOURCE,path);blob=subprocess.check_output(["git","rev-parse",UI_SOURCE+":"+path],cwd=repo).decode().strip()
  assert hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()==blob
  return {"kind":"git-tracked","gitCommit":UI_SOURCE,"path":path,"gitBlob":blob,"sha256":sha(b)}
 facts=[]
 def take(path):
  b=git_bytes(UI_EVIDENCE,PREFIX+path);facts.append({"gitCommit":UI_EVIDENCE,"path":PREFIX+path,"bytes":len(b),"sha256":sha(b)});return b
 dd3zip=take("browser-dd3-raw-evidence.zip");sixzip=take("browser-six-raw-evidence.zip")
 z1=zipfile.ZipFile(BytesIO(dd3zip));z2=zipfile.ZipFile(BytesIO(sixzip))
 def member(z,archive,name):
  b=z.read(name);row={"archive":archive,"member":name,"bytes":len(b),"sha256":sha(b)}
  if name.endswith(".log"):
   display=b.replace(b"\r\r\n",b"\n").replace(b"\r\n",b"\n").rstrip(b"\r\n")+b"\n"
   (inputs/name).write_bytes(display);row["displaySha256"]=sha(display)
   (inputs/(name+".raw.json")).write_text(json.dumps({"archive":archive,"member":name,"rawSha256":sha(b),"rawBase64":base64.b64encode(b).decode(),"displaySha256":sha(display),"displayNormalization":"line endings/terminal blank lines only; exact original retained"},indent=2)+"\n",encoding="utf-8",newline="\n")
  else:(inputs/name).write_bytes(b)
  facts.append(row);return b
 graph_bytes=member(z1,"browser-dd3-raw-evidence.zip","renderer-module-graph.json")
 assert sha(graph_bytes)=="bbca71f4a14564980e5f91504a5eaad706995d9e1b4b64c5da13886427fce072"
 proof_path=PREFIX+"OUTPUT_GRAPH_AND_PROOF_PLAN.md";proof_bytes=git_bytes(UI_OUTPUT_PROOF,proof_path);(inputs/"OUTPUT_GRAPH_AND_PROOF_PLAN.md").write_bytes(proof_bytes);facts.append({"gitCommit":UI_OUTPUT_PROOF,"path":proof_path,"bytes":len(proof_bytes),"sha256":sha(proof_bytes)})
 copied_graph=git_bytes(UI_OUTPUT_PROOF,PREFIX+"renderer-module-graph-dd3.json");assert copied_graph==graph_bytes;facts.append({"gitCommit":UI_OUTPUT_PROOF,"path":PREFIX+"renderer-module-graph-dd3.json","bytes":len(copied_graph),"sha256":sha(copied_graph)})
 emitted_root="/home/ubuntu/tadazz-hq-qa-20261115/evidence/show-ui-dc76-browser-c2/artifact-dd3";fixture_root="/home/ubuntu/tadazz-hq-qa-20261115/fixtures/show-ui-dc76-browser-six"
 assert emitted_root in proof_bytes.decode() and fixture_root in proof_bytes.decode()
 graph=json.loads(graph_bytes);index_bytes=member(z1,"browser-dd3-raw-evidence.zip","artifact-index-dd3.json")
 assert sha(index_bytes)=="38d36c62b57b0e90c00feebebe9c66256a55b60ab617b65632ae1e75f07d586e"
 index=json.loads(index_bytes);fixture=json.loads(member(z2,"browser-six-raw-evidence.zip","fixture-six-before.json"))
 requests=json.loads(member(z2,"browser-six-raw-evidence.zip","requests-six.json"))
 member(z1,"browser-dd3-raw-evidence.zip","build-dd3.log");member(z2,"browser-six-raw-evidence.zip","playwright-six.log")
 inventory_bytes=take("private-fixture-resource-inventory.json");inventory=json.loads(inventory_bytes);(inputs/"private-fixture-resource-inventory.json").write_bytes(inventory_bytes)
 for name in ["BROWSER_DD3_RESULTS.md","BROWSER_SIX_RESULTS.md","BROWSER_D095_STARTUP.md"]:
  (inputs/name).write_bytes(take(name))
 lock_bytes=git_bytes(UI_SOURCE,"pnpm-lock.yaml");lock=lock_bytes.decode();package_section=lock.split("\npackages:\n",1)[1].split("\nsnapshots:\n",1)[0];lock_ref=git_source("pnpm-lock.yaml")
 tracked={};nodes=[];packages={};known_ids={m['id'] for m in graph['modules']};unresolved=[]
 for node in graph['modules']:
  identifier=node['id'];base={"graphModuleId":identifier,"importedIds":node['importedIds'],"dynamicallyImportedIds":node['dynamicallyImportedIds']}
  unresolved.extend(d for d in node['importedIds']+node['dynamicallyImportedIds'] if d not in known_ids)
  match=re.fullmatch(r"/work/node_modules/\.pnpm/([^/]+)/node_modules/(.+)",identifier)
  if match:
   store,tail=match.groups();parts=tail.split('/');count=2 if parts[0].startswith('@') else 1;name='/'.join(parts[:count]);package_path='/'.join(parts[count:]);prefix=name.replace('/','+')+'@';assert store.startswith(prefix);version=store[len(prefix):].split('_',1)[0];key=name+'@'+version
   expression=r"(?m)^  ['\"]?"+re.escape(key)+r"['\"]?:\n    resolution: \{integrity: ([^,}\s]+)"
   found=re.search(expression,package_section);integrity=found.group(1).strip("'\"") if found else None
   package=packages.setdefault(key,{"packageName":name,"packageVersion":version,"snapshotKey":key,"resolutionIntegrity":integrity,"lock":lock_ref,"rawPnpmStoreLocators":[],"graphFileCount":0,"actualFileByteInventory":"MISSING","actualPackageLicenseFiles":"MISSING","reviewedStoreMembershipReceipt":"MISSING_DENIED"})
   if store not in package['rawPnpmStoreLocators']:package['rawPnpmStoreLocators'].append(store)
   package['graphFileCount']+=1
   base.update({"classification":"package-physical-module-id","packageResolutionKey":key,"rawPnpmStoreLocator":store,"packagePath":package_path,"resolvedCanonicalFields":{"kind":"pnpm-package-file","packageName":name,"packageVersion":version,"lockfilePath":"pnpm-lock.yaml","lockfileSha256":lock_ref['sha256'],"snapshotKey":key,"resolutionIntegrity":integrity,"packagePath":package_path},"missingCanonicalFields":["bytes","sha256"],"sourceRecord":None,"byteInventoryOrAttestationInferredFromWindowsCache":False})
  elif identifier.startswith('/work/') and '?' not in identifier:
   path=identifier[len('/work/'):];record=git_source(path);tracked[path]=record;base.update({"classification":"git-physical-module-id","sourceRecord":record,"gitBlobByteSize":len(git_bytes(UI_SOURCE,path)),"actualServerByteAudit":"UI_REPORTED_BASELINE_OVERLAY_AUDIT_FULL_INVENTORY_PENDING"})
  else:
   base.update({"classification":"unresolved-generated-or-external-id","sourceRecord":None})
  nodes.append(base)
 assert len(graph['modules'])==162 and not unresolved
 assert sum(n['classification']=='git-physical-module-id' for n in nodes)==56
 assert sum(n['classification']=='package-physical-module-id' for n in nodes)==106
 # Exact historical graph recipe, not its later type-only harness annotation.
 recipe_path=PREFIX+"qa-renderer-graph.vite.config.ts";recipe=git_source(recipe_path)
 extra=[recipe_path,"extensions/show-preview.vite.config.ts","pnpm-lock.yaml","package.json","extensions/package.json"]
 for path in extra:tracked[path]=git_source(path)
 manifest=json.loads(git_bytes(UI_SOURCE,"extensions/src/core/show-themes/classic.manifest.json"));catalog={a['id']:a for a in manifest['assets']}
 resources=[];resource_evidence=[];files=[]
 for f in index:
  assert fixture[f['path']]['bytes']==f['bytes'] and fixture[f['path']]['sha256']==f['sha256']
  files.append({"path":f['path'],"kind":"module" if f['mime']=='text/javascript' else "style","mime":f['mime'],"bytes":f['bytes'],"sha256":f['sha256']})
 dims={"/tadazz-show/motion/backdrop.webp":(1920,1080),"/tadazz-show/story/84acdb923677d591.webp":(1920,1080),"/tadazz-show/v4/question-bg.webp":(1920,1080),"/tadazz-show/v4/show-stage.webp":(1920,1080),"/tadazz-show/v4/tadazz-brand-logo.png":(1983,793),"/tadazz-show/second-library/teaser-screen-source.jpg":(2048,1152)}
 for row in inventory['resources']:
  source=git_source(row['source']['path']);assert source==row['source'];b=git_bytes(UI_SOURCE,source['path']);assert len(b)==row['bytes'] and sha(b)==row['sha256'];a=catalog[row['catalogAssetId']];assert a['sha256']==row['sha256'] and a['bytes']==row['bytes'] and a['url']==row['requestPath'];assert fixture[row['artifactPath']]['sha256']==row['sha256'] and fixture[row['artifactPath']]['bytes']==row['bytes'];tracked[source['path']]=source
  w,h=dims[row['requestPath']]
  resources.append({"artifactPath":row['artifactPath'],"requestPath":row['requestPath'],"usage":"product-logo" if row['catalogAssetId']=='classic-logo' else "stage-fixed","kind":"image","mime":row['mime'],"bytes":row['bytes'],"sha256":row['sha256'],"source":source,"catalogRef":{"assetId":row['catalogAssetId'],"sha256":row['sha256']},"licenses":[],"rights":{"status":"unknown","provenance":"repository-existing","reviewReceipt":None},"dimensions":{"width":w,"height":h,"decodedPixels":w*h}})
  observed=[r for r in requests if r['path']==row['requestPath'] and r['status']==200];assert observed and all(r['sha256']==row['sha256'] and r['mime']==row['mime'] for r in observed)
  resource_evidence.append({"artifactPath":row['artifactPath'],"sourceGitBytes":"MATCHED_LOCALLY_FROM_DD3_COMMIT","fixtureBeforeModeDecimal":fixture[row['artifactPath']]['mode'],"successfulSixFixtureRequestCount":len(observed),"dimensionEvidence":"UI reported Chromium createImageBitmap/assertions; no decode run by Core","licenseFiles":"MISSING_UNKNOWN_NOT_REPOSITORY_MIT_CLEARANCE","privateQaScope":"manager-authorized-six-existing-files-only","customerExport":"DENIED"})
  files.append({"path":row['artifactPath'],"kind":"image","mime":row['mime'],"bytes":row['bytes'],"sha256":row['sha256']})
 resources.sort(key=lambda r:(r['artifactPath'],r['requestPath']));files.sort(key=lambda f:f['path']);source_records=[tracked[k] for k in sorted(tracked)]
 resource_index={"format":"tadazz-native-resource-index","schemaVersion":2,"scope":"intrinsic-source-only","resources":resources};resource_bytes=canonical(resource_index);(out/'resource-index.diagnostic.json').write_bytes(resource_bytes)
 metadata={"path":"resource-index.json","kind":"metadata","mime":"application/json","bytes":len(resource_bytes),"sha256":sha(resource_bytes)}
 (out/'tracked-sources.candidate.json').write_bytes(canonical(source_records))
 (out/'artifact-files.partial.json').write_text(json.dumps({"format":"evidence-only-artifact-file-parts-not-complete-index","observedEightFiles":files,"generatedMetadataCandidate":metadata,"generatedMetadataStatus":"CREATED_LOCALLY_NOT_INSERTED_IN_FROZEN_UI_OUTPUT","reportedFrozenOutputRoot":emitted_root,"reportedFrozenPrivateFixtureRoot":fixture_root,"protection":"UI-reported directory0555/file0444; discretionary not privileged-writer immutable; rehash before use","physicalPathBindings":[{"artifactPath":f["path"],"fixturePath":fixture_root+"/"+f["path"],"emittedByVite":f["kind"] in ["module","style"],"emittedPath":emitted_root+"/"+f["path"] if f["kind"] in ["module","style"] else None} for f in files],"rawEmittedJsCssBytesReadByCore":False},indent=2)+'\n',encoding='utf-8',newline='\n')
 (out/'module-source-map.json').write_text(json.dumps({"format":"actual-dd3-resolved-module-source-evidence-map","graphSha256":sha(graph_bytes),"resolvedNodes":162,"repositoryNodes":56,"packageNodes":106,"virtualNodesObserved":0,"unresolvedEdges":[],"renderedContributionSizes":"MISSING_RESOLVED_GRAPH_IS_NOT_CHUNK_CONTRIBUTION_INVENTORY","modules":nodes,"packages":[packages[k] for k in sorted(packages)]},indent=2)+'\n',encoding='utf-8',newline='\n')
 known_source_paths=[n['graphModuleId'] for n in nodes if '/core/show-library/' in n['graphModuleId']];assert known_source_paths==['/work/extensions/src/core/show-library/stage-metadata-schema.ts']
 mapping={"status":"ACTUAL_DATA_PLAN_NO_RUNTIME_OR_ACCEPTANCE","uiSourceCommit":UI_SOURCE,"uiEvidenceCommit":UI_EVIDENCE,"uiOutputProofCommit":UI_OUTPUT_PROOF,"reportedFrozenPaths":{"rendererOutput":emitted_root,"sixImageFixture":fixture_root,"reportedDirectoryMode":"0555","reportedFileMode":"0444","independentlyReadByCoreThisPhase":False,"rehashBeforeUse":True,"protection":"ordinary-discretionary-not-immutable-filesystem"},"provisionalTwoFileIndexSha256":sha(index_bytes),"rendererJsCssBytes":sum(f['bytes'] for f in files if f['kind'] in ['module','style']),"nativeImageBytes":sum(r['bytes'] for r in resources),"observedEightFileBytes":sum(f['bytes'] for f in files),"trackedSourceRecordCount":len(source_records),"packageSourceRecordsComplete":0,"packageFilesAwaitingBytes":106,"resourceIndexCandidate":metadata,"coreLeafGraphPaths":known_source_paths,"buildRecipe":recipe,"toolchainFacts":{"node":"24.22.2 (UI-reported)","bundler":"Vite8.3.4 (build log)","arch":"ARM64 (UI-reported)","pnpm":"MISSING","actualProcessPlatformAndImageDigest":"MISSING","exactBuildArgvAndOutputOverride":"MISSING_FROM_AVAILABLE_PACKET"},"additionalCoreDependencyReview":{"paths":["extensions/src/core/packages/protocol.ts","extensions/src/core/packages/manifest.ts","extensions/src/core/packages/paths.ts"],"relationship":"NativePreviewStage -> show-themes/context -> show-themes/index -> definition -> packages/protocol -> packages/manifest","distinction":"Package digest/descriptor schemas and RendererMessageGuard, not ShowLibrary compiled-preview manifest/host authority","emittedContribution":"UNKNOWN_GETMODULEIDS_IS_RESOLVED_GRAPH","status":"ROOT_CORE_REVIEW_REQUIRED_NO_SOURCE_CHANGE"},"baseBuildConfig":tracked['extensions/show-preview.vite.config.ts'],"lockfile":lock_ref,"entryModuleObserved":"renderer.js","entryExportObserved":"mountPreviewCandidate","nativeTheme":{"id":manifest['id'],"version":manifest['version'],"rendererId":manifest['rendererId']},"previewRendererRef":"MISSING_DO_NOT_DERIVE_FROM_NATIVE_THEME_OR_INVENT_VERSION","completeArtifactIndexEmitted":False,"completeIndexMissing":["root-reviewed preview renderer Ref/ABI identity","actual raw package source bytes/sha256 and byte inventory","exact build command/overrides and complete toolchain including pnpm/platform/arch","raw byte rehash of reported frozen output/fixture paths under a separate grant","source/runtime contribution and license closure; explicit review of separate core/packages protocol+manifest dependency"],"separateAuthorityGates":{"sourcePackageMembership":"MISSING_DENIED_INDEPENDENT_ROOT_REVIEWED_CAFS_RECEIPTS","nativeImageRights":"UNKNOWN_ALL_SIX_DENY_EXECUTABLE_EXPORT","immutableLoaderBinding":"PRIVATE_CHECKED_BUFFER_FIXTURE_OBSERVED_PRODUCTION_UNACCEPTED","environmentFonts":"NO_EMITTED_FONT_RUBIK_ABSENT_COMPUTED_GLYPH_RECEIPT_MISSING_NON_HERMETIC","reviewedExecutableAuthority":"EMPTY_UNAVAILABLE_ZERO_PIN"},"browserEvidence":{"d095":"FAILED_HISTORY","dd3FiveImage":{"passed":22,"failed":1,"authored":23},"dd3SixImageAffected":{"passed":3,"failed":0,"priorUnaffectedCasesNotRepeated":20},"completeSameFixtureMatrix":False,"consoleCspAttachmentBodies":"MISSING","fixtureContent":"English synthetic single-choice quiz/five options; UI label locales exercised separately"},"requestEvidence":{"sixFixtureRequests":len(requests),"intentionalNon200":[r for r in requests if r['status']!=200],"nativeResources":resource_evidence},"sourceInputs":facts,"newCoreSchemaRevision":"NONE","compiledPins":[]}
 (out/'ACTUAL_DATA_MAP.json').write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf-8',newline='\n')
 print(json.dumps({"status":mapping['status'],"trackedSources":len(source_records),"graphRepoModules":56,"graphPackageModules":106,"packageKeys":list(packages),"knownFileBytes":mapping['observedEightFileBytes'],"resourceIndexBytes":len(resource_bytes),"resourceIndexSha256":sha(resource_bytes),"completeArtifactIndex":False}))
if __name__=="__main__":main()
