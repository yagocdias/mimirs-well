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
| `skills/mimirs-well/` | claude.ai **e** Claude Code | A skill: Extração, Sentinela, Monitor de Saturação, Pacote de Handoff |
| `hooks/hooks.json` + `scripts/saturation-hook.cjs` | Claude Code (plugin) | Mede a cada turno e só fala com o Claude quando um nível é cruzado |
| `scripts/report.cjs` | Claude Code (plugin) | A skill roda quando você pergunta "estamos saturados?" |
| `scripts/statusline.cjs` | Claude Code (opcional, manual) | O medidor no rodapé do Claude Code |

Sem o plugin (por exemplo, no claude.ai), a skill funciona do mesmo jeito. Ela só avisa que
não tem medição e pede que você olhe o indicador de contexto da sua interface, em vez de chutar.

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

### Opcional: o medidor no rodapé

Algumas interfaces não mostram as mensagens dos hooks. A statusline é desenhada pelo próprio
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
| `context_window` | `0` (auto) | Tamanho da janela. Auto = o tamanho real informado à statusline; senão, deduzido (contexto acima de 200k implica janela de 1M); senão, 200k |
| `cost_factor` | `4` | 🟡 quando o turno reenvia esse múltiplo do contexto do primeiro |
| `red_pct` | `70` | 🔴 nessa % da janela |
| `echo_in_reply` | `false` | Pede ao Claude que termine cada resposta com a linha do medidor, para interfaces que escondem as mensagens dos hooks |

## Privacidade

- Lê o transcript **local** da sessão (o `.jsonl` que o Claude Code já grava) para contar tokens.
- Grava arquivos pequenos de estado na pasta temporária do sistema, em `mimirs-well/`. Os que ficam
  7 dias sem uso são apagados.
- Não envia nada para lugar nenhum. Sem chamadas de rede, sem dependências.

## Limites conhecidos

- **O formato do transcript é interno do Claude Code**, não uma API documentada. Se uma versão
  mudá-lo, o medidor se cala (falha em silêncio, de propósito) até o leitor ser atualizado. A
  statusline usa campos documentados e não é afetada.
- **O hook não enxerga o tamanho da janela**: ele deduz (veja `context_window`).
- **O `report.cjs` rodado à mão, fora do Claude Code,** não sabe de qual sessão você fala: mede a
  que mandou o último prompt naquela pasta. Passe o caminho de um transcript para escolher. (Quando
  o Claude o roda, ele mede a própria sessão.)

## Testar

Roteiro de 15 minutos para quem testa pela primeira vez (em inglês): [TESTING.md](TESTING.md).

## Licença

MIT — veja [LICENSE](LICENSE).
