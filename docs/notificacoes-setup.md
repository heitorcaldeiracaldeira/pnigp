# Setup dos canais de notificação (i10 Gov 360)

O sistema **detecta → roteia → compõe** sozinho. Falta só plugar as credenciais dos canais no `.env.local`.
Sem credencial, cada carteiro roda em **modo SIMULADO** (reporta o que enviaria, não envia — não quebra).

Ordem no pipeline noturno: motor de delta → carteiro e-mail → carteiro WhatsApp.

---

## 📧 E-mail (`scripts/enviar_notificacoes.mjs`)

Adicione ao `.env.local` (NÃO commitar — já está no .gitignore):
```
SMTP_HOST=smtp.gmail.com        # Gmail/Workspace. Resend: smtp.resend.com
SMTP_PORT=587
SMTP_USER=contato@i10.org.br
SMTP_PASS=<senha de app>        # NÃO a senha real — gerar "Senha de app" (exige 2FA)
SMTP_FROM=contato@i10.org.br
```
- **Gmail/Workspace:** Conta Google → Segurança → Verificação em 2 etapas → Senhas de app → gerar. Teto ~500–2000/dia.
- **Resend (recomendado p/ escala):** criar conta grátis (3.000/mês), verificar o domínio `i10.org.br`, usar a API key como `SMTP_PASS` e `resend` como `SMTP_USER`.

Testar: `node scripts/enviar_notificacoes.mjs` (envia se configurado; senão simula).

---

## 💬 WhatsApp (`scripts/enviar_notificacoes_whatsapp.mjs`) — Meta Cloud API

⚠️ **Regra da Meta:** mensagem PROATIVA (iniciada pela empresa) **exige um TEMPLATE aprovado** — não pode texto livre.

**Passos (uma vez):**
1. **Meta Business** (business.facebook.com) → criar/usar a conta da i10.
2. **WhatsApp Business Platform** → adicionar um número de telefone (o número do envio).
3. **App no Meta for Developers** → produto "WhatsApp" → pegar o **Token** (permanente, via System User) e o **Phone Number ID**.
4. **Criar o template** `alerta_gestao` (categoria "Utility"), idioma pt_BR, corpo com **3 variáveis**:
   > Olá {{1}}, o monitoramento identificou {{3}} ponto(s) de atenção na gestão de {{2}}. Acesse o painel i10 Gov 360 para os detalhes e a solução.
5. Aguardar a **aprovação** do template pela Meta (minutos a horas).

**`.env.local`:**
```
WHATSAPP_TOKEN=<token permanente>
WHATSAPP_PHONE_ID=<phone number id>
WHATSAPP_TEMPLATE=alerta_gestao   # nome do template aprovado
WHATSAPP_LANG=pt_BR
```
- Número do destinatário: cadastrado em `celular`; o carteiro converte para E.164 (55 + DDD + número).
- Alternativa mais simples (com custo por msg): **Twilio WhatsApp** — trocar o endpoint/credenciais no sender.

Testar: `node scripts/enviar_notificacoes_whatsapp.mjs`.

---

## Requisitos comuns (LGPD)
O carteiro só envia para contatos com **`contato_verificado=true`** (double opt-in) e cadastro **dentro da validade**.
Marca no log `status_envio='enviado'` (não reenvia). SMS: mesmo padrão, provedor a definir (Zenvia/Twilio).
