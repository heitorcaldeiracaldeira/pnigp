import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function ensure() {
  await query(`CREATE TABLE IF NOT EXISTS notificacao_cadastro (
    id SERIAL PRIMARY KEY, cod_ibge TEXT NOT NULL, nome TEXT NOT NULL, cpf TEXT, matricula TEXT,
    cargo TEXT, secretaria TEXT, perfil TEXT, areas TEXT[] DEFAULT '{}',
    email TEXT, celular TEXT, canal_pref TEXT,
    data_nomeacao DATE, doc_nomeacao TEXT, validade DATE,
    consentimento_lgpd BOOLEAN DEFAULT false, contato_verificado BOOLEAN DEFAULT false, ativo BOOLEAN DEFAULT true,
    criado timestamptz DEFAULT now(), atualizado timestamptz DEFAULT now() )`);
}

// Cadastro de servidores para notificação, por município. GET lista; POST cria/edita; POST {inativar:id} desativa.
export async function GET(req: Request) {
  try {
    await ensure();
    const cod = (new URL(req.url).searchParams.get("cod") || "").replace(/\D/g, "").slice(0, 7);
    const rows = await query(
      `SELECT id, nome, cargo, secretaria, perfil, areas, email, celular, canal_pref, matricula,
        to_char(data_nomeacao,'YYYY-MM-DD') data_nomeacao, doc_nomeacao, to_char(validade,'YYYY-MM-DD') validade,
        consentimento_lgpd, contato_verificado, ativo, (validade IS NOT NULL AND validade < now()) vencido
       FROM notificacao_cadastro WHERE cod_ibge=$1 AND ativo ORDER BY secretaria, nome`, [cod]);
    return NextResponse.json({ servidores: rows });
  } catch (e) {
    return NextResponse.json({ servidores: [], erro: String(e) }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    await ensure();
    const b = await req.json();
    const cod = String(b.cod || "").replace(/\D/g, "").slice(0, 7);
    if (!cod) return NextResponse.json({ ok: false, erro: "cod" }, { status: 400 });

    if (b.inativar) { await query(`UPDATE notificacao_cadastro SET ativo=false, atualizado=now() WHERE id=$1 AND cod_ibge=$2`, [Number(b.inativar), cod]); return NextResponse.json({ ok: true }); }
    // double opt-in: confirma o contato (em produção, dispara um link/código; aqui registra a confirmação)
    if (b.verificar) { await query(`UPDATE notificacao_cadastro SET contato_verificado=true, atualizado=now() WHERE id=$1 AND cod_ibge=$2`, [Number(b.verificar), cod]); return NextResponse.json({ ok: true }); }

    const s = (v: unknown, n = 120) => (v == null ? null : String(v).slice(0, n));
    const nome = s(b.nome, 120);
    if (!nome) return NextResponse.json({ ok: false, erro: "nome" }, { status: 400 });
    if (!b.consentimento_lgpd) return NextResponse.json({ ok: false, erro: "É necessário o consentimento LGPD do servidor." }, { status: 400 });
    const areas = Array.isArray(b.areas) ? b.areas.map((a: unknown) => String(a).slice(0, 60)).slice(0, 20) : [];
    const d = (v: unknown) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
    const params = [cod, nome, s(b.cpf, 14), s(b.matricula, 30), s(b.cargo, 80), s(b.secretaria, 40), s(b.perfil, 20),
      areas, s(b.email, 120), s(b.celular, 20), s(b.canal_pref, 12), d(b.data_nomeacao), s(b.doc_nomeacao, 60), d(b.validade), !!b.consentimento_lgpd];

    if (b.id) {
      await query(`UPDATE notificacao_cadastro SET nome=$2,cpf=$3,matricula=$4,cargo=$5,secretaria=$6,perfil=$7,areas=$8,
        email=$9,celular=$10,canal_pref=$11,data_nomeacao=$12,doc_nomeacao=$13,validade=$14,consentimento_lgpd=$15,atualizado=now()
        WHERE id=$16 AND cod_ibge=$1`, [...params, Number(b.id)]);
    } else {
      await query(`INSERT INTO notificacao_cadastro (cod_ibge,nome,cpf,matricula,cargo,secretaria,perfil,areas,email,celular,canal_pref,data_nomeacao,doc_nomeacao,validade,consentimento_lgpd)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, params);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
