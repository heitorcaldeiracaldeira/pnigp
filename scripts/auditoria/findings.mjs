// AUDITORIA · findings — relatório de discrepâncias (SÓ LEITURA). Não corrige nada; mostra o que o auditor olha.
// node scripts/auditoria/findings.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const T_CONF = `app.item_marca_conferida_${UF}`;
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 120000 });
const q = async (s) => (await db.query(s)).rows;

console.log(`== AUDITORIA · findings (UF=${UF}) ==\n`);

// 1) DOC CORRETO — conferência por trava dupla (o doc de resultado pertence ao processo?)
console.log("1) Doc correto — marca conferida por origem (trava dupla = verificador de doc):");
console.table(await q(`select coalesce(portal,'(nulo)') origem, count(*) itens, count(distinct (cnpj,ano,seq)) procs
  from ${T_CONF} group by 1 order by 2 desc`));

// 2) MARCA RECONCILIADA — o que está vivo agora (reconcile removeu des-homologados)
console.log("2) Marca viva agora (pós-reconcile), por padrão:");
console.table(await q(`select coalesce(fonte_titulo,portal) fonte, count(*) itens from ${T_CONF} group by 1 order by 2 desc limit 8`));

// 3) COBERTURA — itens com vencedor SEM marca, por estado do processo (onde a marca ainda está)
console.log("3) Cobertura — itens com vencedor SEM marca, por estado (onde buscar):");
console.table(await q(`select coalesce(e.estado,'(sem classif)') estado, count(*) itens_sem_marca
  from itens_${UF} i left join app.marca_estado_processo e on e.cnpj=i.cnpj and e.ano=i.ano and e.seq=i.seq
  where i.unit_homologado is not null
    and not exists(select 1 from ${T_CONF} c where c.cnpj=i.cnpj and c.ano=i.ano and c.seq=i.seq and c.numero=i.numero::text)
  group by 1 order by 2 desc`));

// 4) HANDOFF descrição — item cuja descrição da API NÃO é spec, mas o documento tem a spec completa
console.log("4) Handoff descrição — itens onde o DOC tem a spec que faltava na descrição da API:");
console.table(await q(`select descricao_e_spec, confianca, count(*) itens
  from app.item_enriquecimento group by 1,2 order by 3 desc limit 8`));

await db.end();
