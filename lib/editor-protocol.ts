import {validMessage as validate, envelope as makeEnvelope} from './protocol';
export {download} from '../vendor/scratch-editor/src/shared';
type Base = {channel:'ollie-scratch';version:1;sessionId:string;requestId:string};
export type EditorResult = Base & {type:'result';ok:boolean;error?:string;bytes?:ArrayBuffer;backup?:ArrayBuffer;title?:string;preparedId?:string};
export type EditorMessage = EditorResult
 | (Base & {type:'ready'|'dirty';dirty:boolean})
 | (Base & {type:'camera';state:'off'|'loading'|'on'|'error';message:string})
 | (Base & {type:'prepare';bytes:ArrayBuffer;title:string})
 | (Base & {type:'discard';preparedId:string})
 | (Base & {type:'load';downloadFirst:boolean} & ({preparedId:string}|{bytes:ArrayBuffer;title:string}))
 | (Base & {type:'connect'|'open-examples'|'import-request'|'export-request'|'export'});
export const validMessage = (value:unknown):value is EditorMessage => validate(value);
export const envelope = makeEnvelope;
export type EditorAPI = {
 prepare:(bytes:ArrayBuffer,title:string)=>Promise<string>;
 load:(preparedId:string,downloadFirst:boolean)=>Promise<void>;
 discard:(preparedId:string)=>void;
 export:()=>Promise<void>;
};
