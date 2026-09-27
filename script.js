const USERS_KEY = 'osonpay_users';
const SESSION_KEY = 'osonpay_session';
const CURRENCIES = ['UZS', 'USD', 'RUB'];
let transferType = 'wallet';

const authView = document.getElementById('authView');
const walletView = document.getElementById('walletView');
const authMessage = document.getElementById('authMessage');
const transferMessage = document.getElementById('transferMessage');
const withdrawalMessage = document.getElementById('withdrawalMessage');
const currencySelect = document.getElementById('currencySelect');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

['loginPhone', 'registerPhone'].forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('input', () => {
    input.value = normalizePhone(input.value);
  });
});

function getUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    return Array.isArray(users) ? users.filter(user => user && typeof user === 'object') : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return true;
  } catch {
    return false;
  }
}

function normalizeUsers() {
  const users = getUsers();
  let changed = false;
  users.forEach(user => {
    const normalizedPhone = normalizePhone(user.phone);
    if (normalizedPhone !== user.phone) {
      user.phone = normalizedPhone;
      changed = true;
    }
    if (!user.balances || typeof user.balances !== 'object' || Array.isArray(user.balances)) {
      let legacyBalance = Number(user.balance) || 0;
      if (legacyBalance === 1000000 && (!Array.isArray(user.transactions) || user.transactions.length === 0)) {
        legacyBalance = 0;
      }
      user.balances = { UZS: legacyBalance, USD: 0, RUB: 0 };
      delete user.balance;
      changed = true;
    } else {
      CURRENCIES.forEach(currency => {
        if (!Number.isFinite(Number(user.balances[currency]))) {
          user.balances[currency] = 0;
          changed = true;
        }
      });
    }
    if (!CURRENCIES.includes(user.currency)) {
      user.currency = 'UZS';
      changed = true;
    }
  });
  if (changed) saveUsers(users);
}

function showMessage(element, text, type = 'error') {
  element.textContent = text;
  element.className = `message show ${type}`;
}

function clearMessage(element) {
  element.textContent = '';
  element.className = 'message';
}

function setAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
  document.getElementById('registerForm').classList.toggle('hidden', isLogin);
  document.querySelectorAll('.auth-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.auth === tab);
  });
  clearMessage(authMessage);
}

document.querySelectorAll('[data-auth]').forEach(button => {
  button.addEventListener('click', () => setAuthTab(button.dataset.auth));
});
document.querySelectorAll('[data-switch]').forEach(button => {
  button.addEventListener('click', () => setAuthTab(button.dataset.switch));
});

function createWalletCode(users) {
  let code;
  do {
    const digits = window.crypto && window.crypto.getRandomValues
      ? window.crypto.getRandomValues(new Uint32Array(1))[0] % 100000000
      : Math.floor(Math.random() * 100000000);
    code = `EP${String(digits).padStart(8, '0')}`;
  } while (users.some(user => user.walletCode === code));
  return code;
}

document.getElementById('registerForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const phone = normalizePhone(document.getElementById('registerPhone').value);
  const password = document.getElementById('registerPassword').value;
  if (!name || !/^\d{7,15}$/.test(phone) || password.length < 4) {
    showMessage(authMessage, 'Enter your name, a phone number with 7–15 digits, and a password with at least 4 characters.');
    return;
  }
  const users = getUsers();
  if (users.some(user => user.phone === phone)) {
    showMessage(authMessage, 'An account with this phone number already exists. Please log in.');
    return;
  }
  const user = { name, phone, password, walletCode: createWalletCode(users), balances: { UZS: 0, USD: 0, RUB: 0 }, currency: 'UZS', transactions: [] };
  users.push(user);
  if (!saveUsers(users)) {
    showMessage(authMessage, 'Your account could not be saved in this browser. Check your browser storage settings.');
    return;
  }
  try {
    localStorage.setItem(SESSION_KEY, phone);
  } catch {
    showMessage(authMessage, 'Your account was created, but this browser could not save the login session. Please log in.');
    setAuthTab('login');
    return;
  }
  event.target.reset();
  showWallet(user);
});

document.getElementById('loginForm').addEventListener('submit', event => {
  event.preventDefault();
  const phone = normalizePhone(document.getElementById('loginPhone').value);
  const password = document.getElementById('loginPassword').value;
  const user = getUsers().find(item => item.phone === phone && item.password === password);
  if (!user) {
    showMessage(authMessage, 'That phone number and password do not match. Please check your details.');
    return;
  }
  try {
    localStorage.setItem(SESSION_KEY, user.phone);
  } catch {
    showMessage(authMessage, 'Could not save your login session in this browser.');
    return;
  }
  event.target.reset();
  showWallet(user);
});

function formatMoney(amount, currency) {
  const fractionDigits = currency === 'UZS' ? 0 : 2;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits }).format(Number(amount) || 0);
}

function showWallet(user) {
  authView.classList.add('hidden');
  walletView.classList.remove('hidden');
  document.getElementById('headerActions').textContent = 'Your wallet';
  document.getElementById('userName').textContent = (user.name || 'User').trim().split(/\s+/)[0];
  currencySelect.value = CURRENCIES.includes(user.currency) ? user.currency : 'UZS';
  document.getElementById('walletCode').textContent = user.walletCode || '—';
  document.getElementById('walletCodeAside').textContent = user.walletCode || '—';
  updateCurrencyDisplay(user);
  renderTransactions(user);
  renderPendingTransfers(user);
}

function updateCurrencyDisplay(user) {
  const currency = currencySelect.value;
  const balance = Number(user.balances && user.balances[currency]) || 0;
  document.getElementById('balanceAmount').innerHTML = `${formatMoney(balance, currency)} <span>${currency}</span>`;
  document.getElementById('amountCurrency').textContent = currency;
  const amountInput = document.getElementById('amount');
  amountInput.step = currency === 'UZS' ? '1' : '0.01';
  amountInput.min = currency === 'UZS' ? '1' : '0.01';
  amountInput.placeholder = currency === 'UZS' ? '0' : '0.00';
}

currencySelect.addEventListener('change', () => {
  let phone;
  try {
    phone = localStorage.getItem(SESSION_KEY);
  } catch {
    showMessage(transferMessage, 'Could not save your currency preference in this browser.');
    return;
  }
  const users = getUsers();
  const user = users.find(item => item.phone === phone);
  if (!user) return;
  const previousCurrency = user.currency || 'UZS';
  user.currency = currencySelect.value;
  if (!saveUsers(users)) {
    currencySelect.value = previousCurrency;
    updateCurrencyDisplay(user);
    showMessage(transferMessage, 'Your currency preference could not be saved.');
    return;
  }
  updateCurrencyDisplay(user);
  clearMessage(transferMessage);
});

function renderTransactions(user) {
  const list = document.getElementById('transactionList');
  list.innerHTML = '';
  if (!Array.isArray(user.transactions) || user.transactions.length === 0) {
    list.innerHTML = '<div class="empty-history"><span>↗</span><p>No activity yet</p><small>Your transfers will appear here.</small></div>';
    return;
  }
  user.transactions.filter(transaction => transaction && typeof transaction === 'object').slice(0, 5).forEach(transaction => {
    const item = document.createElement('div');
    item.className = 'transaction-item';
    const incoming = transaction.direction === 'in';
    const currency = CURRENCIES.includes(transaction.currency) ? transaction.currency : 'UZS';
    const icon = document.createElement('span');
    icon.className = `transaction-icon${incoming ? ' incoming' : ''}`;
    icon.textContent = incoming ? '↓' : '↗';
    const detail = document.createElement('div');
    detail.className = 'transaction-detail';
    const title = document.createElement('strong');
    title.textContent = transaction.title || 'Wallet transfer';
    const date = document.createElement('small');
    date.textContent = transaction.date || '';
    detail.append(title, date);
    const amount = document.createElement('span');
    amount.className = `transaction-amount ${incoming ? 'incoming' : 'outgoing'}`;
    amount.textContent = `${incoming ? '+' : '−'}${formatMoney(transaction.amount, currency)} ${currency}`;
    item.append(icon, detail, amount);
    list.appendChild(item);
  });
}

function renderPendingTransfers(user) {
  const list = document.getElementById('pendingTransferList');
  const pending = Array.isArray(user.pendingTransfers)
    ? user.pendingTransfers.filter(transfer => transfer && transfer.status === 'pending')
    : [];
  list.innerHTML = '';
  if (pending.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-history';
    empty.innerHTML = '<p>No transfers waiting</p><small>Incoming wallet transfers will appear here.</small>';
    list.appendChild(empty);
    return;
  }

  pending.forEach(transfer => {
    const item = document.createElement('div');
    item.className = 'pending-transfer';
    const detail = document.createElement('div');
    detail.className = 'pending-transfer-detail';
    const title = document.createElement('strong');
    title.textContent = `${transfer.fromName || 'EasyPay user'} sent you ${formatMoney(transfer.amount, transfer.currency)} ${transfer.currency}`;
    const note = document.createElement('small');
    note.textContent = `${transfer.note ? `Note: ${transfer.note} · ` : ''}${transfer.date || ''}`;
    detail.append(title, note);
    const actions = document.createElement('div');
    actions.className = 'pending-transfer-actions';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'pending-accept';
    accept.dataset.pendingAction = 'accept';
    accept.dataset.transferId = transfer.id;
    accept.textContent = 'Accept';
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'pending-decline';
    decline.dataset.pendingAction = 'decline';
    decline.dataset.transferId = transfer.id;
    decline.textContent = 'Decline';
    actions.append(accept, decline);
    item.append(detail, actions);
    list.appendChild(item);
  });
}

function resolvePendingTransfer(transferId, acceptTransfer) {
  let phone;
  try {
    phone = localStorage.getItem(SESSION_KEY);
  } catch {
    showMessage(document.getElementById('pendingMessage'), 'Could not access your wallet in this browser.');
    return;
  }

  const users = JSON.parse(JSON.stringify(getUsers()));
  const recipient = users.find(user => user.phone === phone);
  const transfer = recipient && Array.isArray(recipient.pendingTransfers)
    ? recipient.pendingTransfers.find(item => item.id === transferId && item.status === 'pending')
    : null;
  if (!transfer) {
    showMessage(document.getElementById('pendingMessage'), 'This transfer is no longer waiting for approval.');
    if (recipient) renderPendingTransfers(recipient);
    return;
  }
  const sender = users.find(user => user.phone === transfer.fromPhone);
  if (!sender) {
    showMessage(document.getElementById('pendingMessage'), 'The sender account could not be found.');
    return;
  }

  const currency = CURRENCIES.includes(transfer.currency) ? transfer.currency : 'UZS';
  const decimals = currency === 'UZS' ? 0 : 2;
  const amountMinor = Math.round(Number(transfer.amount) * (10 ** decimals));
  recipient.balances = recipient.balances || { UZS: 0, USD: 0, RUB: 0 };
  sender.balances = sender.balances || { UZS: 0, USD: 0, RUB: 0 };
  sender.transactions = Array.isArray(sender.transactions) ? sender.transactions : [];
  recipient.transactions = Array.isArray(recipient.transactions) ? recipient.transactions : [];

  if (acceptTransfer) {
    recipient.balances[currency] = (Math.round((Number(recipient.balances[currency]) || 0) * (10 ** decimals)) + amountMinor) / (10 ** decimals);
    recipient.transactions.unshift({ direction: 'in', amount: transfer.amount, currency, title: `From: ${transfer.fromName || 'User'}${transfer.note ? ` · ${transfer.note}` : ''}`, date: transfer.date || new Date().toLocaleString('en-US') });
    transfer.status = 'accepted';
    const senderTransaction = sender.transactions.find(item => item.transferId === transferId);
    if (senderTransaction) {
      senderTransaction.status = 'sent';
      senderTransaction.title = senderTransaction.title.replace(' · Pending', ' · Sent');
    }
  } else {
    sender.balances[currency] = (Math.round((Number(sender.balances[currency]) || 0) * (10 ** decimals)) + amountMinor) / (10 ** decimals);
    sender.transactions.unshift({ direction: 'in', amount: transfer.amount, currency, title: 'Declined transfer — amount returned', date: new Date().toLocaleString('en-US') });
    transfer.status = 'declined';
    const senderTransaction = sender.transactions.find(item => item.transferId === transferId);
    if (senderTransaction) {
      senderTransaction.status = 'declined';
      senderTransaction.title = senderTransaction.title.replace(' · Pending', ' · Declined');
    }
  }

  if (!saveUsers(users)) {
    showMessage(document.getElementById('pendingMessage'), 'The decision could not be saved. Balances have not changed.');
    return;
  }
  updateCurrencyDisplay(recipient);
  renderTransactions(recipient);
  renderPendingTransfers(recipient);
  showMessage(document.getElementById('pendingMessage'), acceptTransfer ? 'Transfer accepted and added to your balance.' : 'Transfer declined; the amount was returned to the sender.', 'success');
}

document.getElementById('pendingTransferList').addEventListener('click', event => {
  const button = event.target.closest('[data-pending-action]');
  if (!button) return;
  resolvePendingTransfer(button.dataset.transferId, button.dataset.pendingAction === 'accept');
});

function updateTransferType(type) {
  transferType = type;
  document.querySelectorAll('.transfer-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.transfer === type);
  });
  const isWallet = type === 'wallet';
  const recipient = document.getElementById('recipient');
  document.getElementById('recipientLabel').textContent = isWallet ? 'Recipient’s wallet code' : 'Recipient’s card number';
  recipient.placeholder = isWallet ? 'e.g. EP12345678' : '0000 0000 0000 0000';
  recipient.inputMode = isWallet ? 'text' : 'numeric';
  recipient.maxLength = isWallet ? 10 : 16;
  document.getElementById('recipientHint').textContent = isWallet ? 'Ask the recipient for their EasyPay wallet code.' : 'Enter a 16-digit card number.';
  if (!isWallet) recipient.value = recipient.value.replace(/\D/g, '').slice(0, 16);
  clearMessage(transferMessage);
}

document.getElementById('recipient').addEventListener('input', event => {
  if (transferType === 'card') event.target.value = event.target.value.replace(/\D/g, '').slice(0, 16);
});

document.getElementById('withdrawalCard').addEventListener('input', event => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 16);
});

document.querySelectorAll('.transfer-tab').forEach(button => {
  button.addEventListener('click', () => updateTransferType(button.dataset.transfer));
});

document.getElementById('transferForm').addEventListener('submit', event => {
  event.preventDefault();
  let phone;
  try {
    phone = localStorage.getItem(SESSION_KEY);
  } catch {
    showMessage(transferMessage, 'Could not access your wallet in this browser.');
    return;
  }
  const users = getUsers();
  const sender = users.find(user => user.phone === phone);
  if (!sender) {
    logout();
    return;
  }
  const currency = CURRENCIES.includes(currencySelect.value) ? currencySelect.value : 'UZS';
  const recipientValue = document.getElementById('recipient').value.trim();
  const amountInput = document.getElementById('amount');
  const amountValue = Number(amountInput.value);
  const note = document.getElementById('transferNote').value.trim();
  const decimals = currency === 'UZS' ? 0 : 2;
  if (!recipientValue) {
    showMessage(transferMessage, transferType === 'wallet' ? 'Enter the recipient’s wallet code.' : 'Enter the recipient’s 16-digit card number.');
    return;
  }
  if (!amountInput.value) {
    showMessage(transferMessage, 'Enter an amount to send.');
    return;
  }
  const amountInMinorUnits = Math.round(amountValue * (10 ** decimals));
  if (!Number.isFinite(amountValue) || amountValue <= 0 || !Number.isSafeInteger(amountInMinorUnits) || Math.abs(amountValue * (10 ** decimals) - amountInMinorUnits) > 0.000001) {
    showMessage(transferMessage, currency === 'UZS' ? 'Enter a whole UZS amount greater than zero.' : 'Enter an amount greater than zero with up to 2 decimal places.');
    return;
  }
  const senderBalance = Number(sender.balances && sender.balances[currency]) || 0;
  if (amountInMinorUnits > Math.round(senderBalance * (10 ** decimals))) {
    showMessage(transferMessage, `Your ${currency} balance is too low for this transfer.`);
    return;
  }

  // Apply changes to a draft so a failed storage write cannot leave balances partly changed.
  const transferUsers = JSON.parse(JSON.stringify(users));
  const transferSender = transferUsers.find(user => user.phone === sender.phone);
  const now = new Date().toLocaleString('en-US');
  if (transferType === 'wallet') {
    if (!/^EP\d{8}$/i.test(recipientValue)) {
      showMessage(transferMessage, 'Enter a valid 10-character EasyPay wallet code (EP followed by 8 digits).');
      return;
    }
    const recipient = transferUsers.find(user => String(user.walletCode || '').toUpperCase() === recipientValue.toUpperCase());
    if (!recipient) {
      showMessage(transferMessage, 'We could not find that wallet code. Check it and try again.');
      return;
    }
    if (recipient.phone === sender.phone) {
      showMessage(transferMessage, 'You cannot send money to your own wallet.');
      return;
    }
    transferSender.balances[currency] = (Math.round(senderBalance * (10 ** decimals)) - amountInMinorUnits) / (10 ** decimals);
    transferSender.transactions = Array.isArray(transferSender.transactions) ? transferSender.transactions : [];
    recipient.pendingTransfers = Array.isArray(recipient.pendingTransfers) ? recipient.pendingTransfers : [];
    const transferId = window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    recipient.pendingTransfers.unshift({ id: transferId, fromPhone: sender.phone, fromName: sender.name || 'User', amount: amountValue, currency, note, date: now, status: 'pending' });
    transferSender.transactions.unshift({ direction: 'out', amount: amountValue, currency, title: `To wallet: ${recipient.name || 'User'}${note ? ` · ${note}` : ''} · Pending`, date: now, status: 'pending', transferId });
  } else {
    const digits = recipientValue.replace(/\D/g, '');
    if (digits.length !== 16) {
      showMessage(transferMessage, 'Card numbers must contain exactly 16 digits.');
      return;
    }
    transferSender.balances[currency] = (Math.round(senderBalance * (10 ** decimals)) - amountInMinorUnits) / (10 ** decimals);
    transferSender.transactions = Array.isArray(transferSender.transactions) ? transferSender.transactions : [];
    transferSender.transactions.unshift({ direction: 'out', amount: amountValue, currency, title: `To card: •••• ${digits.slice(-4)}${note ? ` · ${note}` : ''}`, date: now });
  }

  if (!saveUsers(transferUsers)) {
    showMessage(transferMessage, 'The transfer could not be saved. Your balance has not been updated.');
    return;
  }
  updateCurrencyDisplay(transferSender);
  renderTransactions(transferSender);
  event.target.reset();
  showMessage(transferMessage, transferType === 'wallet' ? 'Transfer sent. The recipient must accept it before the balance is credited.' : 'Transfer complete.', 'success');
});

document.getElementById('withdrawalForm').addEventListener('submit', event => {
  event.preventDefault();
  let phone;
  try {
    phone = localStorage.getItem(SESSION_KEY);
  } catch {
    showMessage(withdrawalMessage, 'Could not access your wallet in this browser.');
    return;
  }

  const users = getUsers();
  const user = users.find(item => item.phone === phone);
  if (!user) {
    logout();
    return;
  }
  const balance = Number(user.balances && user.balances.UZS) || 0;
  if (balance < 200000) {
    showMessage(withdrawalMessage, 'Your UZS wallet balance is too low to withdraw.');
    return;
  }

  const cardDigits = document.getElementById('withdrawalCard').value.replace(/\D/g, '');
  const amount = Number(document.getElementById('withdrawalAmount').value);
  if (!/^\d{16}$/.test(cardDigits)) {
    showMessage(withdrawalMessage, 'Enter a valid 16-digit card number.');
    return;
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    showMessage(withdrawalMessage, 'Enter a whole UZS amount greater than zero.');
    return;
  }
  if (amount > balance) {
    showMessage(withdrawalMessage, 'Your UZS balance is too low for this withdrawal.');
    return;
  }

  const previousBalance = balance;
  const previousTransactions = Array.isArray(user.transactions) ? user.transactions : [];
  user.balances.UZS = balance - amount;
  user.transactions = [...previousTransactions];
  user.transactions.unshift({
    direction: 'out',
    amount,
    currency: 'UZS',
    title: `Withdrawal to card: •••• ${cardDigits.slice(-4)}`,
    date: new Date().toLocaleString('en-US')
  });

  if (!saveUsers(users)) {
    user.balances.UZS = previousBalance;
    user.transactions = previousTransactions;
    showMessage(withdrawalMessage, 'The withdrawal could not be saved. Your balance has not changed.');
    return;
  }

  updateCurrencyDisplay(user);
  renderTransactions(user);
  event.target.reset();
  showMessage(withdrawalMessage, 'Withdrawal successful.', 'success');
});

async function copyCode() {
  const code = document.getElementById('walletCode').textContent;
  if (!code || code === '—') return;
  try {
    await navigator.clipboard.writeText(code);
    showMessage(transferMessage, 'Wallet code copied.', 'success');
    window.setTimeout(() => clearMessage(transferMessage), 2200);
  } catch {
    showMessage(transferMessage, `Your wallet code is ${code}`, 'success');
  }
}

document.getElementById('copyWalletCode').addEventListener('click', copyCode);
document.getElementById('copyWalletCodeAside').addEventListener('click', copyCode);
document.getElementById('logoutButton').addEventListener('click', logout);

function logout() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // The auth screen can still be shown if browser storage is unavailable.
  }
  walletView.classList.add('hidden');
  authView.classList.remove('hidden');
  document.getElementById('headerActions').textContent = '';
  setAuthTab('login');
}

normalizeUsers();

const ADMIN_PHONE = '998991754018';
const ADMIN_PASSWORD = 'Hasanjon2012';
const users = getUsers();
let admin = users.find(user => normalizePhone(user.phone) === ADMIN_PHONE);
if (admin) {
  admin.name = 'Hasanjon';
  admin.phone = ADMIN_PHONE;
  admin.password = ADMIN_PASSWORD;
  admin.role = 'admin';
} else {
  admin = {
    name: 'Hasanjon',
    phone: ADMIN_PHONE,
    password: ADMIN_PASSWORD,
    walletCode: createWalletCode(users),
    balances: { UZS: 0, USD: 0, RUB: 0 },
    currency: 'UZS',
    transactions: [],
    role: 'admin'
  };
  users.push(admin);
}
if (admin.initialBalanceGranted !== true) {
  admin.balances = admin.balances && typeof admin.balances === 'object' && !Array.isArray(admin.balances)
    ? admin.balances
    : { UZS: 0, USD: 0, RUB: 0 };
  admin.balances.UZS = 100000000;
  admin.initialBalanceGranted = true;
}
saveUsers(users);

try {
  const savedPhone = normalizePhone(localStorage.getItem(SESSION_KEY));
  if (savedPhone) {
    const savedUser = getUsers().find(user => user.phone === savedPhone);
    if (savedUser) {
      localStorage.setItem(SESSION_KEY, savedUser.phone);
      showWallet(savedUser);
    } else logout();
  }
} catch {
  // Keep the login screen available when browser storage is disabled.
}
