import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { build, validate } from './builder.ts';
try {
  const input=JSON.parse(await readFile(process.argv[2] ?? 'sample-data/input.json','utf8'));
  const bundle=build(input);const errors=validate(bundle);
  if(errors.length)throw new Error(errors.join('; '));
  await mkdir('output',{recursive:true});await writeFile('output/bundle.json',JSON.stringify(bundle,null,2)+'\n');
  console.log(JSON.stringify({validForSampleRules:true,exchangeValidated:false,resources:bundle.entry.length,output:'output/bundle.json'},null,2));
} catch(error){console.error(error instanceof Error?error.message:'Build failed');process.exitCode=1;}
