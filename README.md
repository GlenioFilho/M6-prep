# M6 Motors — Vehicle Prep

App web para o celular da equipe de uma concessionária: estoque → preparação →
entrega, checklist de serviços por função e relatório semanal de pagamento.

- `public/` — o app completo (HTML/CSS/JS puro, sem build)
- `supabase/schema.sql` — banco de dados, regras de acesso (RLS) e armazenamento de fotos
- `netlify.toml` — publica a pasta `public/`

## Configuração (uma vez só)

### 1. Supabase
1. Crie uma conta em https://supabase.com e um projeto novo (região: **West EU (Ireland)**).
2. **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**.
   ⚠️ Obrigatório: com o cadastro ligado, qualquer pessoa consegue criar uma conta
   e entrar como staff.
4. **Authentication → Users → Add user → Create new user**: crie uma conta para cada
   pessoa. A equipe entra só com o **nome**, então o email é interno:
   `nome@m6.local` (ex.: `ana@m6.local`, `ana.paula@m6.local` para "Ana Paula").
   Use uma senha inicial de pelo menos 6 caracteres e marque *Auto Confirm User*.
   Cada pessoa troca a senha no primeiro acesso: círculo com a inicial → *Change password*.
   Esqueceu a senha? Não há email de recuperação — o admin define uma nova no
   painel do Supabase (Authentication → Users → abrir o usuário).
5. Transforme os gerentes em admin: no SQL Editor rode
   ```sql
   update public.profiles set is_admin = true
   where id in (select id from auth.users where email in ('nome@m6.local'));
   ```
6. **Project Settings → API**: copie a *Project URL* e a chave *anon / publishable*
   para `public/config.js`.

### 2. Netlify
- Mais simples: entre em https://app.netlify.com/drop e arraste a pasta `public`.
- Ou conecte este repositório (o `netlify.toml` já aponta para `public`).

### 3. Equipe
Entre como admin → ícone de pessoas (Team) → escolha quem faz Full Valet,
First Clean e Polish. Os nomes podem ser editados na mesma tela.

## Testar no computador
```bash
python -m http.server 8080 --directory public
```
Abra http://localhost:8080.

## Como a segurança funciona
- Todas as tabelas usam row-level security: só usuários com login veem ou alteram dados.
  A chave `anon` em `config.js` é pública por design — ela sozinha não dá acesso a nada.
- A regra "só a equipe de cada função marca o serviço" é aplicada **no banco**
  (trigger `vehicles_guard`), não só na tela. Quem marcou e quando é gravado pelo
  servidor, não pelo celular, então não dá para marcar serviço em nome de outra pessoa.
- O relatório de pagamento lê a tabela `service_completions`, que guarda cada serviço
  concluído. Ela não é apagada quando os carros entregues com mais de 30 dias são
  limpos, então os números de um período fechado não mudam.
