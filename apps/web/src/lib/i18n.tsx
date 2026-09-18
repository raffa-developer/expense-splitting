import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { ApiError } from "@/api";
import { setFormattingLocale } from "@/money";

export type Locale = "en" | "pt-PT";

const en = {
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.loading": "Loading…",
  "common.saving": "Saving…",
  "common.deleting": "Deleting…",
  "common.removing": "Removing…",
  "common.creating": "Creating…",
  "common.save": "Save",

  "app.allGroups": "All groups",
  "app.theme": "Theme",
  "app.light": "Light",
  "app.dark": "Dark",
  "app.system": "System",
  "app.logout": "Log out",
  "app.language": "Language",
  "app.languageEnglish": "English",
  "app.languagePortuguese": "Português (PT)",
  "app.toggleTheme": "Toggle theme",

  "nav.dashboard": "Dashboard",
  "nav.groups": "Groups",
  "nav.yourGroups": "Your groups",
  "nav.noGroups": "No groups yet.",
  "nav.menu": "Menu",
  "nav.openMenu": "Open menu",

  "auth.loginTitle": "Welcome back",
  "auth.registerTitle": "Create your account",
  "auth.subtitle": "Split expenses with friends and settle up in seconds.",
  "auth.loginTab": "Log in",
  "auth.registerTab": "Sign up",
  "auth.name": "Name",
  "auth.namePlaceholder": "Alex",
  "auth.email": "Email",
  "auth.emailPlaceholder": "you@example.com",
  "auth.password": "Password",
  "auth.passwordPlaceholder": "••••••••",
  "auth.passwordPlaceholderRegister": "At least 8 characters",
  "auth.submitLogin": "Log in",
  "auth.submitRegister": "Create account",
  "auth.submitting": "Please wait…",
  "auth.welcomeBack": "Welcome back",
  "auth.accountCreated": "Account created",
  "auth.emailTaken": "That email already has an account. Enter your password.",

  "groups.title": "Groups",
  "groups.subtitle":
    "Create a group for a trip, a house, or a night out, then add what everyone paid.",
  "groups.new": "New group",
  "groups.dialogDescription":
    "Give it a name and choose the currency everyone will use.",
  "groups.name": "Name",
  "groups.namePlaceholder": "Lisbon Trip",
  "groups.currency": "Currency",
  "groups.create": "Create group",
  "groups.created": "Group created",
  "groups.emptyTitle": "No groups yet",
  "groups.emptyDescription":
    "Create your first group, add the expenses, and we will work out who owes whom.",
  "groups.memberOne": "{count} member",
  "groups.memberMany": "{count} members",

  "dashboard.greeting": "Hi, {name}",
  "dashboard.subtitle": "Where you stand across your groups.",
  "dashboard.net": "Net",
  "dashboard.yourBalance": "Your balance",
  "dashboard.newExpense": "New expense",
  "dashboard.addExpenseAria": "Add expense to {name}",
  "dashboard.owedToYou": "You're owed",
  "dashboard.youOwe": "You owe",
  "dashboard.groupsSubSame": "All in {currency}.",
  "dashboard.groupsSubMixed": "Across {count} currencies.",
  "dashboard.mixedCurrencies": "Multiple currencies, shown per group.",

  "group.back": "Groups",
  "group.personOne": "{count} person",
  "group.personMany": "{count} people",
  "group.metaTotal": "Total {total}, in {currency}.",
  "group.tabOverview": "Overview",
  "group.tabExpenses": "Expenses",
  "group.tabPeople": "People",
  "group.emptyExpensesTitle": "No expenses yet.",
  "group.emptyExpensesBody":
    "Add the first expense and balances, settle up, and payment history appear here.",
  "group.yourPosition": "Your position",
  "group.youPaid": "You paid",
  "group.yourShare": "Your share",
  "group.youSettled": "Settled",
  "group.options": "Group options",
  "group.delete": "Delete group",
  "group.deleteTitle": "Delete “{name}”?",
  "group.deleteDescription":
    "Every expense, balance, and payment in this group will be permanently deleted. This cannot be undone.",
  "group.deleted": "Group deleted",

  "settle.title": "Settle up",
  "settle.description": "The fewest payments that make everyone even.",
  "settle.done": "Everyone is settled up.",
  "settle.markPaid": "Mark paid",
  "settle.recent": "Recent payments",
  "settle.paidLine": "{from} paid {to} {amount}",
  "settle.undo": "Undo",
  "settle.recorded": "Payment recorded",
  "settle.removed": "Payment removed",

  "expenses.title": "Expenses",
  "expenses.countOne": "{count} expense recorded.",
  "expenses.countMany": "{count} expenses recorded.",
  "expenses.empty": "Nothing here yet.",
  "expenses.emptyHint": "Add the first expense with the buttons at the top.",
  "expenses.paidLine":
    "{name} paid {amount}, split {split} between {count} {people}.",
  "expenses.paidByLine":
    "{name} paid, split {split} between {count} {people}.",
  "expenses.splitEqual": "equally",
  "expenses.splitExact": "as exact amounts",
  "expenses.splitPercentage": "by percentage",
  "expenses.splitShares": "by shares",
  "expenses.personOne": "person",
  "expenses.personMany": "people",
  "expenses.loadMore": "Load more ({count} remaining)",
  "expenses.deleteTitle": "Delete expense",
  "expenses.deleteDescription":
    "“{name}” will be removed and everyone's balances will be updated. This cannot be undone.",
  "expenses.deleted": "Expense deleted",
  "expenses.deleteAria": "Delete {name}",
  "expenses.editAria": "Edit {name}",

  "balances.title": "Balances",
  "balances.description":
    "What each person paid, and whether they get money back or still owe.",
  "balances.person": "Person",
  "balances.paid": "Paid",
  "balances.position": "Position",
  "balances.getsBack": "gets back {amount}",
  "balances.getsBackLabel": "to receive",
  "balances.owes": "owes {amount}",
  "balances.owesLabel": "to pay",
  "balances.settled": "settled",

  "chart.title": "Paid vs fair share",
  "chart.description":
    "What each person fronted compared with their fair share of everything.",
  "chart.paid": "Paid",
  "chart.share": "Fair share",

  "flow.aria": "Diagram of suggested payments between group members",
  "flow.hint":
    "Arrows show who pays whom. The biggest amounts are matched first, so the fewest payments are needed.",

  "people.title": "People",
  "people.countOne": "{count} person in this group.",
  "people.countMany": "{count} people in this group.",
  "people.addPlaceholder": "Add someone by email",
  "people.find": "Find",
  "people.noResults": "No registered users match that email.",
  "people.add": "Add",
  "people.added": "{name} added",
  "people.remove": "Remove",
  "people.removeAria": "Remove {name}",
  "people.removeTitle": "Remove {name}?",
  "people.removeDescription":
    "They will no longer see this group. Any balance they still have stays in the settlement until it is paid.",
  "people.removed": "{name} removed",

  "expenseDialog.title": "Add expense",
  "expenseDialog.description":
    "One thing someone paid for. Use “Add several” to enter a whole night out at once.",
  "expenseDialog.what": "What was it?",
  "expenseDialog.whatPlaceholder": "Dinner, taxi, groceries…",
  "expenseDialog.amount": "Amount ({currency})",
  "expenseDialog.amountPlaceholder": "24.50",
  "expenseDialog.paidBy": "Who paid?",
  "expenseDialog.split": "How should it be split?",
  "expenseDialog.participants": "Who shares it?",
  "expenseDialog.splitEqual": "Split equally",
  "expenseDialog.splitExact": "Exact amounts",
  "expenseDialog.splitPercentage": "By percentage",
  "expenseDialog.splitShares": "By shares (weights)",
  "expenseDialog.hintExact":
    "Exact amounts are in {currency} and must add up to the total.",
  "expenseDialog.hintPercentage": "Percentages must add up to 100.",
  "expenseDialog.hintShares": "Shares are weights, e.g. 2 and 1.",
  "expenseDialog.submit": "Add expense",
  "expenseDialog.added": "Expense added",
  "expenseDialog.editTitle": "Edit expense",
  "expenseDialog.editDescription": "Change the details of this expense.",
  "expenseDialog.updated": "Expense updated",
  "expenseDialog.errorAmount": "Enter a valid amount, for example 24.50.",
  "expenseDialog.errorParticipants":
    "Select at least one person to share this expense.",
  "expenseDialog.errorExact":
    "Enter a valid amount for everyone sharing this expense.",

  "batchDialog.trigger": "Add several",
  "batchDialog.title": "Add several expenses",
  "batchDialog.description":
    "Perfect for a night out: list every item and who fronted it, and each is split equally between the people selected below.",
  "batchDialog.whoWasThere": "Who was there?",
  "batchDialog.items": "Items",
  "batchDialog.itemDescriptionPlaceholder": "Food + drinks",
  "batchDialog.itemAmountPlaceholder": "120.00",
  "batchDialog.addItem": "Add item",
  "batchDialog.total": "Total",
  "batchDialog.eachPerson": "Each person",
  "batchDialog.removeItem": "Remove item",
  "batchDialog.whoPaid": "Who paid",
  "batchDialog.errorParticipants": "Select at least one person who was there.",
  "batchDialog.errorName": "Item {index}: give it a name.",
  "batchDialog.errorAmount": "Item {index}: enter a valid amount.",
  "batchDialog.submitOne": "Add 1 expense",
  "batchDialog.submitMany": "Add {count} expenses",
  "batchDialog.addedOne": "Expense added",
  "batchDialog.addedMany": "{count} expenses added",

  "errors.generic": "Something went wrong. Try again.",
  "errors.VALIDATION_ERROR": "Some fields are not valid. Please check them.",
  "errors.BAD_REQUEST": "Some fields are not valid. Please check them.",
  "errors.INVALID_NAME": "The name cannot be empty.",
  "errors.INVALID_DESCRIPTION": "The description cannot be empty.",
  "errors.EMAIL_TAKEN": "An account with this email already exists.",
  "errors.INVALID_CREDENTIALS": "Invalid email or password.",
  "errors.UNAUTHORIZED": "Your session expired. Please log in again.",
  "errors.FORBIDDEN": "You do not have access to this group.",
  "errors.GROUP_NOT_FOUND": "Group not found.",
  "errors.USER_NOT_FOUND": "User not found.",
  "errors.USER_NOT_IN_GROUP": "That user is not part of this group.",
  "errors.ALREADY_MEMBER": "That person is already in the group.",
  "errors.NOT_A_MEMBER": "That person is not in the group.",
  "errors.EXPENSE_NOT_FOUND": "Expense not found.",
  "errors.SETTLEMENT_NOT_FOUND": "Payment not found.",
  "errors.INVALID_SETTLEMENT": "That payment is not valid.",
  "errors.INVALID_SPLIT": "The split is not valid. Please check the values.",
  "errors.DUPLICATE_PARTICIPANT": "Someone is listed twice in the split.",
  "errors.PAYER_NOT_MEMBER": "The payer is not part of this group.",
  "errors.PARTICIPANT_NOT_MEMBER": "Someone in the split is not part of this group.",
  "errors.REQUEST_IN_PROGRESS": "This request is already being processed.",
  "errors.IDEMPOTENCY_KEY_REUSED": "This request was already used.",
  "errors.INTERNAL_ERROR": "Something went wrong. Try again."
} as const;

export type MessageKey = keyof typeof en;

const pt: Record<MessageKey, string> = {
  "common.cancel": "Cancelar",
  "common.delete": "Eliminar",
  "common.loading": "A carregar…",
  "common.saving": "A guardar…",
  "common.deleting": "A eliminar…",
  "common.removing": "A remover…",
  "common.creating": "A criar…",
  "common.save": "Guardar",

  "app.allGroups": "Todos os grupos",
  "app.theme": "Tema",
  "app.light": "Claro",
  "app.dark": "Escuro",
  "app.system": "Sistema",
  "app.logout": "Sair",
  "app.language": "Idioma",
  "app.languageEnglish": "English",
  "app.languagePortuguese": "Português (PT)",
  "app.toggleTheme": "Mudar tema",

  "nav.dashboard": "Painel",
  "nav.groups": "Grupos",
  "nav.yourGroups": "Os teus grupos",
  "nav.noGroups": "Ainda não há grupos.",
  "nav.menu": "Menu",
  "nav.openMenu": "Abrir menu",

  "auth.loginTitle": "Bem-vindo de volta",
  "auth.registerTitle": "Cria a tua conta",
  "auth.subtitle": "Divide despesas com amigos e acerta contas em segundos.",
  "auth.loginTab": "Entrar",
  "auth.registerTab": "Criar conta",
  "auth.name": "Nome",
  "auth.namePlaceholder": "Alex",
  "auth.email": "Email",
  "auth.emailPlaceholder": "tu@exemplo.com",
  "auth.password": "Palavra-passe",
  "auth.passwordPlaceholder": "••••••••",
  "auth.passwordPlaceholderRegister": "Pelo menos 8 caracteres",
  "auth.submitLogin": "Entrar",
  "auth.submitRegister": "Criar conta",
  "auth.submitting": "Aguarda…",
  "auth.welcomeBack": "Bem-vindo de volta",
  "auth.accountCreated": "Conta criada",
  "auth.emailTaken":
    "Já existe uma conta com este email. Introduz a palavra-passe.",

  "groups.title": "Grupos",
  "groups.subtitle":
    "Cria um grupo para uma viagem, uma casa ou uma saída à noite, depois adiciona o que cada um pagou.",
  "groups.new": "Novo grupo",
  "groups.dialogDescription":
    "Dá-lhe um nome e escolhe a moeda que todos vão usar.",
  "groups.name": "Nome",
  "groups.namePlaceholder": "Viagem a Lisboa",
  "groups.currency": "Moeda",
  "groups.create": "Criar grupo",
  "groups.created": "Grupo criado",
  "groups.emptyTitle": "Ainda não há grupos",
  "groups.emptyDescription":
    "Cria o teu primeiro grupo, adiciona as despesas e nós calculamos quem deve a quem.",
  "groups.memberOne": "{count} membro",
  "groups.memberMany": "{count} membros",

  "dashboard.greeting": "Olá, {name}",
  "dashboard.subtitle": "A tua posição em todos os grupos.",
  "dashboard.net": "Saldo",
  "dashboard.yourBalance": "O teu saldo",
  "dashboard.newExpense": "Nova despesa",
  "dashboard.addExpenseAria": "Adicionar despesa a {name}",
  "dashboard.owedToYou": "Tens a receber",
  "dashboard.youOwe": "Deves",
  "dashboard.groupsSubSame": "Todas em {currency}.",
  "dashboard.groupsSubMixed": "Em {count} moedas.",
  "dashboard.mixedCurrencies": "Várias moedas, mostradas por grupo.",

  "group.back": "Grupos",
  "group.personOne": "{count} pessoa",
  "group.personMany": "{count} pessoas",
  "group.metaTotal": "Total {total}, em {currency}.",
  "group.tabOverview": "Resumo",
  "group.tabExpenses": "Despesas",
  "group.tabPeople": "Pessoas",
  "group.emptyExpensesTitle": "Ainda não há despesas.",
  "group.emptyExpensesBody":
    "Adiciona a primeira despesa e os saldos, os acertos e o histórico aparecem aqui.",
  "group.yourPosition": "A tua situação",
  "group.youPaid": "Pagaste",
  "group.yourShare": "A tua parte",
  "group.youSettled": "Já acertaste",
  "group.options": "Opções do grupo",
  "group.delete": "Eliminar grupo",
  "group.deleteTitle": "Eliminar «{name}»?",
  "group.deleteDescription":
    "Todas as despesas, saldos e pagamentos deste grupo serão eliminados permanentemente. Esta ação não pode ser anulada.",
  "group.deleted": "Grupo eliminado",

  "settle.title": "Acertar contas",
  "settle.description": "O mínimo de pagamentos para ficar tudo certo.",
  "settle.done": "Está tudo acertado.",
  "settle.markPaid": "Marcar como pago",
  "settle.recent": "Pagamentos recentes",
  "settle.paidLine": "{from} pagou {amount} a {to}",
  "settle.undo": "Desfazer",
  "settle.recorded": "Pagamento registado",
  "settle.removed": "Pagamento removido",

  "expenses.title": "Despesas",
  "expenses.countOne": "{count} despesa registada.",
  "expenses.countMany": "{count} despesas registadas.",
  "expenses.empty": "Ainda não há nada aqui.",
  "expenses.emptyHint": "Adiciona a primeira despesa com os botões em cima.",
  "expenses.paidLine":
    "{name} pagou {amount}, dividido {split} por {count} {people}.",
  "expenses.paidByLine":
    "{name} pagou, dividido {split} por {count} {people}.",
  "expenses.splitEqual": "igualmente",
  "expenses.splitExact": "em valores exatos",
  "expenses.splitPercentage": "em percentagem",
  "expenses.splitShares": "em quotas",
  "expenses.personOne": "pessoa",
  "expenses.personMany": "pessoas",
  "expenses.loadMore": "Carregar mais (faltam {count})",
  "expenses.deleteTitle": "Eliminar despesa",
  "expenses.deleteDescription":
    "«{name}» será eliminada e os saldos de todos serão atualizados. Esta ação não pode ser anulada.",
  "expenses.deleted": "Despesa eliminada",
  "expenses.deleteAria": "Eliminar {name}",
  "expenses.editAria": "Editar {name}",

  "balances.title": "Saldos",
  "balances.description":
    "O que cada pessoa pagou e se recebe dinheiro de volta ou ainda deve.",
  "balances.person": "Pessoa",
  "balances.paid": "Pagou",
  "balances.position": "Situação",
  "balances.getsBack": "recebe {amount}",
  "balances.getsBackLabel": "a receber",
  "balances.owes": "deve {amount}",
  "balances.owesLabel": "a pagar",
  "balances.settled": "em dia",

  "chart.title": "Pagou vs parte justa",
  "chart.description":
    "O que cada pessoa adiantou comparado com a sua parte justa do total.",
  "chart.paid": "Pagou",
  "chart.share": "Parte justa",

  "flow.aria": "Diagrama dos pagamentos sugeridos entre os membros do grupo",
  "flow.hint":
    "As setas mostram quem paga a quem. Os maiores valores são ligados primeiro, para serem precisas o mínimo de transferências.",

  "people.title": "Pessoas",
  "people.countOne": "{count} pessoa neste grupo.",
  "people.countMany": "{count} pessoas neste grupo.",
  "people.addPlaceholder": "Adicionar alguém por email",
  "people.find": "Procurar",
  "people.noResults": "Nenhum utilizador registado com esse email.",
  "people.add": "Adicionar",
  "people.added": "{name} adicionado(a)",
  "people.remove": "Remover",
  "people.removeAria": "Remover {name}",
  "people.removeTitle": "Remover {name}?",
  "people.removeDescription":
    "Deixa de ver este grupo. Qualquer saldo pendente mantém-se no acerto até ser pago.",
  "people.removed": "{name} removido(a)",

  "expenseDialog.title": "Adicionar despesa",
  "expenseDialog.description":
    "Uma coisa que alguém pagou. Usa «Adicionar várias» para registar uma noite inteira de uma vez.",
  "expenseDialog.what": "O que foi?",
  "expenseDialog.whatPlaceholder": "Jantar, táxi, compras…",
  "expenseDialog.amount": "Valor ({currency})",
  "expenseDialog.amountPlaceholder": "24,50",
  "expenseDialog.paidBy": "Quem pagou?",
  "expenseDialog.split": "Como dividir?",
  "expenseDialog.participants": "Quem partilha?",
  "expenseDialog.splitEqual": "Dividir igualmente",
  "expenseDialog.splitExact": "Valores exatos",
  "expenseDialog.splitPercentage": "Por percentagem",
  "expenseDialog.splitShares": "Por quotas (pesos)",
  "expenseDialog.hintExact":
    "Os valores exatos são em {currency} e têm de somar o total.",
  "expenseDialog.hintPercentage": "As percentagens têm de somar 100.",
  "expenseDialog.hintShares": "As quotas são pesos, por exemplo 2 e 1.",
  "expenseDialog.submit": "Adicionar despesa",
  "expenseDialog.added": "Despesa adicionada",
  "expenseDialog.editTitle": "Editar despesa",
  "expenseDialog.editDescription": "Altera os detalhes desta despesa.",
  "expenseDialog.updated": "Despesa atualizada",
  "expenseDialog.errorAmount": "Introduz um valor válido, por exemplo 24,50.",
  "expenseDialog.errorParticipants":
    "Seleciona pelo menos uma pessoa para partilhar esta despesa.",
  "expenseDialog.errorExact":
    "Introduz um valor válido para cada pessoa que partilha a despesa.",

  "batchDialog.trigger": "Adicionar várias",
  "batchDialog.title": "Adicionar várias despesas",
  "batchDialog.description":
    "Ideal para uma saída à noite: lista cada item e quem o pagou, e cada um é dividido igualmente pelas pessoas selecionadas abaixo.",
  "batchDialog.whoWasThere": "Quem esteve presente?",
  "batchDialog.items": "Itens",
  "batchDialog.itemDescriptionPlaceholder": "Comida + bebidas",
  "batchDialog.itemAmountPlaceholder": "120,00",
  "batchDialog.addItem": "Adicionar item",
  "batchDialog.total": "Total",
  "batchDialog.eachPerson": "Cada pessoa",
  "batchDialog.removeItem": "Remover item",
  "batchDialog.whoPaid": "Quem pagou",
  "batchDialog.errorParticipants":
    "Seleciona pelo menos uma pessoa que esteve presente.",
  "batchDialog.errorName": "Item {index}: dá-lhe um nome.",
  "batchDialog.errorAmount": "Item {index}: introduz um valor válido.",
  "batchDialog.submitOne": "Adicionar 1 despesa",
  "batchDialog.submitMany": "Adicionar {count} despesas",
  "batchDialog.addedOne": "Despesa adicionada",
  "batchDialog.addedMany": "{count} despesas adicionadas",

  "errors.generic": "Algo correu mal. Tenta novamente.",
  "errors.VALIDATION_ERROR": "Há campos inválidos. Verifica-os.",
  "errors.BAD_REQUEST": "Há campos inválidos. Verifica-os.",
  "errors.INVALID_NAME": "O nome não pode estar vazio.",
  "errors.INVALID_DESCRIPTION": "A descrição não pode estar vazia.",
  "errors.EMAIL_TAKEN": "Já existe uma conta com este email.",
  "errors.INVALID_CREDENTIALS": "Email ou palavra-passe inválidos.",
  "errors.UNAUTHORIZED": "A sessão expirou. Entra novamente.",
  "errors.FORBIDDEN": "Não tens acesso a este grupo.",
  "errors.GROUP_NOT_FOUND": "Grupo não encontrado.",
  "errors.USER_NOT_FOUND": "Utilizador não encontrado.",
  "errors.USER_NOT_IN_GROUP": "Esse utilizador não faz parte do grupo.",
  "errors.ALREADY_MEMBER": "Essa pessoa já faz parte do grupo.",
  "errors.NOT_A_MEMBER": "Essa pessoa não faz parte do grupo.",
  "errors.EXPENSE_NOT_FOUND": "Despesa não encontrada.",
  "errors.SETTLEMENT_NOT_FOUND": "Pagamento não encontrado.",
  "errors.INVALID_SETTLEMENT": "Esse pagamento não é válido.",
  "errors.INVALID_SPLIT": "A divisão não é válida. Verifica os valores.",
  "errors.DUPLICATE_PARTICIPANT": "Há uma pessoa repetida na divisão.",
  "errors.PAYER_NOT_MEMBER": "Quem pagou não faz parte do grupo.",
  "errors.PARTICIPANT_NOT_MEMBER":
    "Alguém na divisão não faz parte do grupo.",
  "errors.REQUEST_IN_PROGRESS": "Este pedido já está a ser processado.",
  "errors.IDEMPOTENCY_KEY_REUSED": "Este pedido já foi usado.",
  "errors.INTERNAL_ERROR": "Algo correu mal. Tenta novamente."
};

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en,
  "pt-PT": pt
};

export type Translate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

function interpolate(
  message: string,
  params?: Record<string, string | number>
): string {
  if (!params) {
    return message;
  }
  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

const STORAGE_KEY = "expense-splitting-locale";

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "pt-PT") {
    return stored;
  }
  return navigator.language?.toLowerCase().startsWith("pt") ? "pt-PT" : "en";
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    setFormattingLocale(locale);
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback<Translate>(
    (key, params) => interpolate(dictionaries[locale][key], params),
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function errorMessage(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}` as MessageKey;
    if (key in en) {
      return t(key);
    }
  }
  return t("errors.generic");
}
