# Mimir's Well

*[Read in English](README.md)*

Uma skill de meta-aprendizado para o Claude que faz duas coisas:

1. **Guarda o que vale a pena.** Extrai padrões reaproveitáveis de um projeto ou conversa
   (Extração) e sinaliza, sem interromper, soluções elegantes e lições aprendidas no caminho
   (Sentinela).
2. **Sabe, por medição, quando a sessão deve acabar.** Monitora a saturação da sessão e, na
   hora certa, escreve um **Pacote de Handoff** para a sessão nova já começar orientada.

## Por que o sinal de saturação é medido

O modelo não percebe o quanto o próprio contexto está cheio. "A conversa parece longa" é
chute. E "tudo bem, tem cache" está errado: o cache deixa cada token reenviado ~10× mais
barato, mas **cada turno reenvia o contexto inteiro**. O custo por turno cresce linearmente
com o contexto, e o custo da sessão cresce mais ou menos com o **quadrado** do comprimento.
Numa sessão medida, o último turno custou 6,5× o primeiro.

Por isso o sinal tem dois níveis, que respondem a perguntas diferentes:

| | Pergunta | Gatilho padrão |
|---|---|---|
| 🟡 | Os turnos ficaram caros? (seu plano/orçamento) | o turno reenvia ≥ **4×** o contexto do primeiro |
| 🔴 | O handoff ainda cabe? (a janela) | contexto ≥ **70%** da janela |

Detalhes: [`context-economics.md`](skills/mimirs-well/references/context-economics.md).

## O que vem no pacote

| Peça | Onde roda | O que faz |
|---|---|---|
| `skills/mimirs-well/` | claude.ai **e** Claude Code | A skill: Extração, Sentinela, Monitor de Saturação, handoff |
| `hooks/meter-band.tsx` | Claude Code (plugin), terminal **e app desktop** | O medidor, desenhado acima do prompt |
| `scripts/session-start.cjs` | Claude Code (plugin) | No início da sessão: mantém a Sentinela ligada, aponta o poço do projeto, oferece um handoff recente |
| `scripts/well.cjs` | Claude Code (plugin) | Onde o poço fica no disco; o índice que a skill lê para a síntese entre projetos |
| `hooks/hooks.json` + `scripts/saturation-hook.cjs` | Claude Code (plugin) | Mede a cada turno e só fala com o Claude quando um nível é cruzado |
| `scripts/report.cjs` | Claude Code (plugin) | A skill roda quando você pergunta "estamos saturados?" |
| `scripts/statusline.cjs` | Claude Code (opcional, manual) | O medidor no rodapé do Claude Code |

Sem o plugin (por exemplo, no claude.ai), a skill funciona do mesmo jeito. Ela só avisa que
não tem medição e pede que você olhe o indicador de contexto da sua interface, em vez de chutar.

## O poço no disco

No Claude Code, tudo o que o poço produz é salvo num lugar só para todos os seus projetos, para
sobreviver à sessão e permitir comparar projetos:

```
~/.mimir/projects/<projeto>/
  reports/AAAA-MM-DD-<tema>.md     Pattern Reports e Synthesis Reports
  seeds/<nome>.md                  Skill Seeds
  well-log.md                      entradas da Sentinela que você aceitou
  anchor.md                        a Continuity Anchor mais recente
  handoffs/AAAA-MM-DD-HHMM.md      handoffs de projetos sem HANDOFF.md próprio
```

Um projeto é a raiz git da pasta em que você trabalha.

**O handoff mora no projeto.** Se ele tem um `HANDOFF.md` vivo (na raiz, em `docs/` ou em
`.claude/`), esse arquivo é o handoff: o Claude o atualiza no lugar, na estrutura dele, e
responde em duas linhas, sem blocos para copiar. Um projeto sem esse arquivo ganha um
`docs/HANDOFF.md` (o Claude pergunta antes) ou, se você preferir deixá-lo fora do repositório,
um arquivo no poço. Na sessão seguinte, diga "verifique os handoffs", ou aceite quando o Claude
oferecer um handoff atualizado nas últimas 48 horas.

A síntese entre projetos começa por um índice dos relatórios de todos os projetos e lê só os
que importam. Mude o local com a opção `well_dir`. No claude.ai, que não tem sistema de
arquivos, os artefatos ficam na conversa.

## Instalação

### Claude Code (skill + sinal medido)

Precisa do **Node.js 18+** no `PATH` (o hook é um script Node).

```
/plugin marketplace add yagocdias/mimirs-well
/plugin install mimirs-well@mimirs-well
```

Ou pelo terminal: `claude plugin marketplace add yagocdias/mimirs-well` e depois `claude plugin install mimirs-well@mimirs-well`.

Reinicie o Claude Code depois de instalar: os hooks são carregados na abertura.

### claude.ai (só a skill)

Opcional: para manter os modos passivos sempre ligados num Projeto do claude.ai, cole o bloco de [docs/claude-ai-project-instructions.md](docs/claude-ai-project-instructions.md) nas instruções do Projeto. O Claude Code não precisa disso.

Baixe o **`mimirs-well.skill`** da [última release](https://github.com/yagocdias/mimirs-well/releases/latest) e envie como skill personalizada nas configurações do claude.ai. (Ou compacte você mesmo a pasta `skills/mimirs-well/`.)

### O medidor acima do prompt

O plugin desenha o medidor numa faixa acima do prompt, no terminal e no app desktop, onde as
mensagens dos hooks não aparecem: `🟡 Mimir's Well · 291k of 1M (29%) · turn ~4.2x the first ·
~$12.50 est.` Ele lê os números do próprio Claude Code, então a janela é a real. Não precisa
configurar nada; exige uma versão do Claude Code com módulos de interface para plugins (nas
mais antigas fica a linha do hook).

### Opcional: o medidor no rodapé

A statusline é uma alternativa para o terminal. A statusline é desenhada pelo próprio
Claude Code. Como plugin não pode instalar statusline, este passo é manual:

1. Copie `scripts/statusline.cjs` para um lugar estável, por exemplo
   `~/.claude/mimirs-well-statusline.cjs`. Não aponte para a pasta do plugin: o caminho dela
   muda a cada atualização.
2. Acrescente ao `~/.claude/settings.json`, com o caminho absoluto:

   ```json
   "statusLine": {
     "type": "command",
     "command": "node /caminho/absoluto/para/mimirs-well-statusline.cjs"
   }
   ```

⚠️ O Claude Code tem **uma** statusline só. Se você já tem uma, esta a substitui.

## Configuração

Os padrões já funcionam. Para mudar: `/plugin configure mimirs-well@mimirs-well` (ou `--config CHAVE=VALOR` na instalação, ou variáveis de ambiente `MIMIR_*`):

| Opção | Padrão | Significado |
|---|---|---|
| `context_window` | `0` (auto) | Tamanho da janela. Auto = o tamanho real informado à statusline; senão, a janela do modelo (Fable, Sonnet 5+, Haiku 5.5+ e Opus 4.7+ rodam com 1M), respeitando `CLAUDE_CODE_DISABLE_1M_CONTEXT`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS` e `CLAUDE_CODE_AUTO_COMPACT_WINDOW`; senão, deduzido (contexto acima de 200k implica 1M); senão, 200k, marcado como **assumed** |
| `cost_factor` | `4` | 🟡 quando o turno reenvia esse múltiplo do contexto do primeiro |
| `red_pct` | `70` | 🔴 nessa % da janela |
| `well_dir` | `~/.mimir` | Onde o poço guarda relatórios, seeds, log e handoffs, uma pasta por projeto |
| `echo_in_reply` | `false` | Pede ao Claude que termine cada resposta com a linha do medidor, para interfaces que não mostram nem as mensagens dos hooks nem a faixa acima do prompt |

## Privacidade

- Lê o transcript **local** da sessão (o `.jsonl` que o Claude Code já grava) para contar tokens.
- Grava arquivos pequenos de estado na pasta temporária do sistema, em `mimirs-well/`. Os que ficam
  7 dias sem uso são apagados.
- Salva o que o poço produz (relatórios, seeds, log, handoffs) em `~/.mimir/`, ou no seu `well_dir`.
  São as conclusões das suas conversas: não publique essa pasta.
- Não envia nada para lugar nenhum. Sem chamadas de rede, sem dependências.

## Limites conhecidos

- **O formato do transcript é interno do Claude Code**, não uma API documentada. Se uma versão
  mudá-lo, o medidor se cala (falha em silêncio, de propósito) até o leitor ser atualizado. A
  statusline usa campos documentados e não é afetada.
- **O hook não enxerga o tamanho da janela**: ele a deduz pelo modelo (veja `context_window`). No
  Opus 4.6 e no Sonnet 4.6 o ID do modelo não distingue 200k da variante `[1m]`: aí o medidor avisa
  que a janela é *assumida*. Configure `context_window`, ou instale a statusline, para resolver.
- **O `report.cjs` rodado à mão, fora do Claude Code,** não sabe de qual sessão você fala: mede a
  que mandou o último prompt naquela pasta. Passe o caminho de um transcript para escolher. (Quando
  o Claude o roda, ele mede a própria sessão.)

## Testar

Roteiro de 15 minutos para quem testa pela primeira vez (em inglês): [TESTING.md](TESTING.md).

## Licença

MIT — veja [LICENSE](LICENSE).
