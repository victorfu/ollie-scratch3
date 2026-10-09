import type {NextConfig} from 'next';
const config:NextConfig={
 outputFileTracingIncludes:{'/api/examples':['./examples/web/**/*'],'/api/examples/**':['./examples/web/**/*']},
async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'Permissions-Policy',value:'camera=(self), microphone=(self)'},{key:'Content-Security-Policy',value:"frame-ancestors 'self'; object-src 'none'"}]},{source:'/scratch-editor/:path*',headers:[{key:'Cache-Control',value:'no-cache'}]}];}};
export default config;
