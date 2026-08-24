// ABSTRAÇÃO DE ARMAZENAMENTO DE OBJETO (binário) — backend plugável por env `ARQUIVO_STORAGE`.
// A CHAVE do objeto é a mesma em qualquer backend → migrar de `local` p/ `s3` é só re-apontar o env (e sincronizar).
//
//   ARQUIVO_STORAGE=local  (default)  → disco. Bom p/ dev/verificação; NÃO p/ centenas de GB em produção.
//   ARQUIVO_STORAGE=s3                → AWS S3. A SOLUÇÃO COMPLETA quando a plataforma for p/ um servidor potente.
//
// Por que object storage e não o Postgres: são ~627 mil PDFs (~centenas de GB). O Neon guarda o ÍNDICE
// (arquivo_binario_sc: chave + hash + tamanho); o BINÁRIO vive no objeto. Separação certa: metadado no banco, arquivo no bucket.
import fs from "fs"; import path from "path"; import crypto from "crypto";

const BACKEND = (process.env.ARQUIVO_STORAGE || "local").toLowerCase();

// ─────────────────────────── LOCAL (disco) ───────────────────────────
const DIR = process.env.ARQUIVO_DIR || path.join(process.cwd(), "arquivo_pdf");
async function putLocal(chave, buf) {
  const dest = path.join(DIR, chave);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.writeFile(dest, buf);
  return { storage: "local", ref: dest };
}
async function existsLocal(chave) { try { await fs.promises.access(path.join(DIR, chave)); return true; } catch { return false; } }

// ─────────────────────────── S3 / AWS (a solução completa) ───────────────────────────
// PASSO A PASSO p/ ligar quando migrar p/ AWS (ex.: EC2/ECS potente):
//   1. npm i @aws-sdk/client-s3
//   2. env:  ARQUIVO_STORAGE=s3 · AWS_REGION=sa-east-1 · S3_BUCKET=pnigp-documentos-pncp
//            credenciais via ROLE IAM da instância (recomendado) — ou AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
//   3. bucket com VERSIONAMENTO ligado → quando o PNCP substitui um documento (evento de Exclusão+Inclusão), o
//      re-arquivo vira uma VERSÃO nova do mesmo objeto = histórico fiel do documento, casando com o log do PNCP.
// O código abaixo já está PRONTO; só não roda sem o pacote (import tardio, guardado) — por isso o `local` é o default hoje.
let _s3;
async function s3() {
  if (_s3) return _s3;
  const { S3Client } = await import("@aws-sdk/client-s3");           // instalado só no servidor AWS
  _s3 = new S3Client({ region: process.env.AWS_REGION || "sa-east-1" });
  return _s3;
}
async function putS3(chave, buf, contentType) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const Bucket = process.env.S3_BUCKET;
  await (await s3()).send(new PutObjectCommand({ Bucket, Key: chave, Body: buf, ContentType: contentType || "application/pdf" }));
  return { storage: "s3", ref: `s3://${Bucket}/${chave}` };
}
async function existsS3(chave) {
  try { const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: chave })); return true; }
  catch { return false; }
}

// (Ponte opcional: Vercel Blob — se um dia quiser um meio-termo sem AWS. Deixado como nota, não implementado:
//  npm i @vercel/blob; import { put } from "@vercel/blob"; put(chave, buf, { access: "private" }). Limites/custo p/
//  centenas de GB tornam o S3 a escolha certa em escala — por isso a camada já mira o S3.)

export const STORAGE = BACKEND;
export async function putObject(chave, buf, contentType) {
  return BACKEND === "s3" ? putS3(chave, buf, contentType) : putLocal(chave, buf);
}
export async function objectExists(chave) {
  return BACKEND === "s3" ? existsS3(chave) : existsLocal(chave);
}
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
