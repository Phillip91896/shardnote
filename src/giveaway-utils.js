const { randomInt } = require("node:crypto");
const DAY_MS = 86400000;
const MAX_TIMER_DELAY_MS = 2147483647;

function parseDuration(value) {
  const match = String(value || "").trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return null;
  const milliseconds = Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000, d: DAY_MS }[match[2]]);
  return Number.isSafeInteger(milliseconds) && milliseconds >= 1000 && milliseconds <= 30 * DAY_MS ? milliseconds : null;
}

function pickRandomWinners(userIds, winnerCount, random = randomInt) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const count = Number.isFinite(Number(winnerCount)) ? Math.floor(Number(winnerCount)) : 0;
  return ids.slice(0, Math.max(0, Math.min(ids.length, count)));
}

function timerDelayUntil(endsAt, now = Date.now()) {
  const endTime = new Date(endsAt).getTime();
  if (!Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.min(endTime - now, MAX_TIMER_DELAY_MS));
}

const KEYS = ["join","joined","already","closed","started","dbRequired","createFailed","invalidDuration","title","details","resultTitle","winner","none"];
const GIVEAWAY_TEXTS = {
  da: {join:"🎉 Deltag",joined:"🎉 Du deltager nu!",already:"Du deltager allerede.",closed:"Denne giveaway er afsluttet.",started:"🎉 Giveaway startet.",dbRequired:"Giveaways kræver en databaseforbindelse.",createFailed:"Giveawayen kunne ikke oprettes. Prøv igen.",invalidDuration:"Brug fx 10m, 2h eller 1d. Maksimum er 28 dage.",title:"🎉 Giveaway: {prize}",details:"Vindere: **{winners}**\nSlutter: <t:{timestamp}:R>\nDeltagere: **{entries}**",resultTitle:"Giveaway afsluttet",winner:"🎉 Vinder(e): {winners}\nPræmie: {prize}",none:"🎉 Ingen deltagere.\nPræmie: {prize}"},
  en: {join:"🎉 Enter",joined:"🎉 You're entered!",already:"You're already entered.",closed:"This giveaway has ended.",started:"🎉 Giveaway started.",dbRequired:"Giveaways require a database connection.",createFailed:"The giveaway could not be created. Please try again.",invalidDuration:"Use e.g. 10m, 2h or 1d. Maximum is 28 days.",title:"🎉 Giveaway: {prize}",details:"Winners: **{winners}**\nEnds: <t:{timestamp}:R>\nEntries: **{entries}**",resultTitle:"Giveaway ended",winner:"🎉 Winner(s): {winners}\nPrize: {prize}",none:"🎉 No entries.\nPrize: {prize}"},
  de: {join:"🎉 Teilnehmen",joined:"🎉 Du nimmst teil!",already:"Du nimmst bereits teil.",closed:"Dieses Gewinnspiel ist beendet.",started:"🎉 Gewinnspiel gestartet.",dbRequired:"Gewinnspiele benötigen eine Datenbankverbindung.",createFailed:"Das Gewinnspiel konnte nicht erstellt werden. Bitte erneut versuchen.",invalidDuration:"Verwende z. B. 10m, 2h oder 1d. Maximal 28 Tage.",title:"🎉 Gewinnspiel: {prize}",details:"Gewinner: **{winners}**\nEndet: <t:{timestamp}:R>\nTeilnahmen: **{entries}**",resultTitle:"Gewinnspiel beendet",winner:"🎉 Gewinner: {winners}\nPreis: {prize}",none:"🎉 Keine Teilnahmen.\nPreis: {prize}"},
  fr: {join:"🎉 Participer",joined:"🎉 Participation enregistrée !",already:"Vous participez déjà.",closed:"Ce concours est terminé.",started:"🎉 Concours lancé.",dbRequired:"Les concours nécessitent une connexion à la base de données.",createFailed:"Impossible de créer le concours. Réessayez.",invalidDuration:"Utilisez 10m, 2h ou 1d. Maximum : 28 jours.",title:"🎉 Concours : {prize}",details:"Gagnants : **{winners}**\nFin : <t:{timestamp}:R>\nParticipations : **{entries}**",resultTitle:"Concours terminé",winner:"🎉 Gagnant(s) : {winners}\nLot : {prize}",none:"🎉 Aucune participation.\nLot : {prize}"},
  es: {join:"🎉 Participar",joined:"🎉 ¡Ya estás participando!",already:"Ya estás participando.",closed:"Este sorteo ha terminado.",started:"🎉 Sorteo iniciado.",dbRequired:"Los sorteos requieren una conexión a la base de datos.",createFailed:"No se pudo crear el sorteo. Inténtalo de nuevo.",invalidDuration:"Usa 10m, 2h o 1d. Máximo: 28 días.",title:"🎉 Sorteo: {prize}",details:"Ganadores: **{winners}**\nTermina: <t:{timestamp}:R>\nParticipantes: **{entries}**",resultTitle:"Sorteo terminado",winner:"🎉 Ganador(es): {winners}\nPremio: {prize}",none:"🎉 No hay participantes.\nPremio: {prize}"},
  it: {join:"🎉 Partecipa",joined:"🎉 Partecipazione registrata!",already:"Hai già partecipato.",closed:"Questo giveaway è terminato.",started:"🎉 Giveaway avviato.",dbRequired:"I giveaway richiedono una connessione al database.",createFailed:"Impossibile creare il giveaway. Riprova.",invalidDuration:"Usa 10m, 2h o 1d. Massimo 28 giorni.",title:"🎉 Giveaway: {prize}",details:"Vincitori: **{winners}**\nTermina: <t:{timestamp}:R>\nPartecipanti: **{entries}**",resultTitle:"Giveaway terminato",winner:"🎉 Vincitore/i: {winners}\nPremio: {prize}",none:"🎉 Nessun partecipante.\nPremio: {prize}"},
  nl: {join:"🎉 Meedoen",joined:"🎉 Je doet mee!",already:"Je doet al mee.",closed:"Deze giveaway is afgelopen.",started:"🎉 Giveaway gestart.",dbRequired:"Giveaways vereisen een databaseverbinding.",createFailed:"De giveaway kon niet worden aangemaakt. Probeer het opnieuw.",invalidDuration:"Gebruik 10m, 2h of 1d. Maximaal 28 dagen.",title:"🎉 Giveaway: {prize}",details:"Winnaars: **{winners}**\nEindigt: <t:{timestamp}:R>\nDeelnemers: **{entries}**",resultTitle:"Giveaway afgelopen",winner:"🎉 Winnaar(s): {winners}\nPrijs: {prize}",none:"🎉 Geen deelnemers.\nPrijs: {prize}"},
  pt: {join:"🎉 Participar",joined:"🎉 Participação registada!",already:"Você já está participando.",closed:"Este sorteio terminou.",started:"🎉 Sorteio iniciado.",dbRequired:"Os sorteios precisam de uma conexão com o banco de dados.",createFailed:"Não foi possível criar o sorteio. Tente novamente.",invalidDuration:"Use 10m, 2h ou 1d. Máximo: 28 dias.",title:"🎉 Sorteio: {prize}",details:"Vencedores: **{winners}**\nTermina: <t:{timestamp}:R>\nParticipantes: **{entries}**",resultTitle:"Sorteio encerrado",winner:"🎉 Vencedor(es): {winners}\nPrêmio: {prize}",none:"🎉 Nenhum participante.\nPrêmio: {prize}"},
  sv: {join:"🎉 Delta",joined:"🎉 Du deltar nu!",already:"Du deltar redan.",closed:"Den här utlottningen har avslutats.",started:"🎉 Utlottningen har startat.",dbRequired:"Utlottningar kräver en databasanslutning.",createFailed:"Utlottningen kunde inte skapas. Försök igen.",invalidDuration:"Använd 10m, 2h eller 1d. Max 28 dagar.",title:"🎉 Utlottning: {prize}",details:"Vinnare: **{winners}**\nSlutar: <t:{timestamp}:R>\nDeltagare: **{entries}**",resultTitle:"Utlottningen är avslutad",winner:"🎉 Vinnare: {winners}\nPris: {prize}",none:"🎉 Inga deltagare.\nPris: {prize}"},
  no: {join:"🎉 Delta",joined:"🎉 Du er med!",already:"Du er allerede med.",closed:"Denne giveawayen er avsluttet.",started:"🎉 Giveaway startet.",dbRequired:"Giveaways krever en databasetilkobling.",createFailed:"Giveawayen kunne ikke opprettes. Prøv igjen.",invalidDuration:"Bruk 10m, 2h eller 1d. Maks 28 dager.",title:"🎉 Giveaway: {prize}",details:"Vinnere: **{winners}**\nAvsluttes: <t:{timestamp}:R>\nDeltakere: **{entries}**",resultTitle:"Giveaway avsluttet",winner:"🎉 Vinner(e): {winners}\nPremie: {prize}",none:"🎉 Ingen deltakere.\nPremie: {prize}"},
  fi: {join:"🎉 Osallistu",joined:"🎉 Olet mukana!",already:"Olet jo mukana.",closed:"Tämä arvonta on päättynyt.",started:"🎉 Arvonta aloitettu.",dbRequired:"Arvonnat vaativat tietokantayhteyden.",createFailed:"Arvontaa ei voitu luoda. Yritä uudelleen.",invalidDuration:"Käytä 10m, 2h tai 1d. Enintään 28 päivää.",title:"🎉 Arvonta: {prize}",details:"Voittajat: **{winners}**\nPäättyy: <t:{timestamp}:R>\nOsallistujat: **{entries}**",resultTitle:"Arvonta päättynyt",winner:"🎉 Voittaja(t): {winners}\nPalkinto: {prize}",none:"🎉 Ei osallistujia.\nPalkinto: {prize}"},
  pl: {join:"🎉 Dołącz",joined:"🎉 Bierzesz udział!",already:"Już bierzesz udział.",closed:"To rozdanie zostało zakończone.",started:"🎉 Rozdanie rozpoczęte.",dbRequired:"Rozdania wymagają połączenia z bazą danych.",createFailed:"Nie udało się utworzyć rozdania. Spróbuj ponownie.",invalidDuration:"Użyj 10m, 2h lub 1d. Maksymalnie 28 dni.",title:"🎉 Rozdanie: {prize}",details:"Zwycięzcy: **{winners}**\nKoniec: <t:{timestamp}:R>\nUczestnicy: **{entries}**",resultTitle:"Rozdanie zakończone",winner:"🎉 Zwycięzca(y): {winners}\nNagroda: {prize}",none:"🎉 Brak uczestników.\nNagroda: {prize}"},
  tr: {join:"🎉 Katıl",joined:"🎉 Çekilişe katıldın!",already:"Zaten katıldın.",closed:"Bu çekiliş sona erdi.",started:"🎉 Çekiliş başlatıldı.",dbRequired:"Çekilişler için veritabanı bağlantısı gerekir.",createFailed:"Çekiliş oluşturulamadı. Lütfen tekrar dene.",invalidDuration:"10m, 2h veya 1d kullan. En fazla 28 gün.",title:"🎉 Çekiliş: {prize}",details:"Kazananlar: **{winners}**\nBitiş: <t:{timestamp}:R>\nKatılımcılar: **{entries}**",resultTitle:"Çekiliş sona erdi",winner:"🎉 Kazanan(lar): {winners}\nÖdül: {prize}",none:"🎉 Katılımcı yok.\nÖdül: {prize}"},
  ru: {join:"🎉 Участвовать",joined:"🎉 Вы участвуете!",already:"Вы уже участвуете.",closed:"Этот розыгрыш завершён.",started:"🎉 Розыгрыш запущен.",dbRequired:"Для розыгрышей требуется подключение к базе данных.",createFailed:"Не удалось создать розыгрыш. Попробуйте ещё раз.",invalidDuration:"Например: 10m, 2h или 1d. Максимум — 28 дней.",title:"🎉 Розыгрыш: {prize}",details:"Победители: **{winners}**\nЗавершение: <t:{timestamp}:R>\nУчастники: **{entries}**",resultTitle:"Розыгрыш завершён",winner:"🎉 Победитель(и): {winners}\nПриз: {prize}",none:"🎉 Нет участников.\nПриз: {prize}"},
  uk: {join:"🎉 Взяти участь",joined:"🎉 Ви берете участь!",already:"Ви вже берете участь.",closed:"Цей розіграш завершено.",started:"🎉 Розіграш розпочато.",dbRequired:"Для розіграшів потрібне підключення до бази даних.",createFailed:"Не вдалося створити розіграш. Спробуйте ще раз.",invalidDuration:"Наприклад: 10m, 2h або 1d. Максимум — 28 днів.",title:"🎉 Розіграш: {prize}",details:"Переможці: **{winners}**\nЗавершення: <t:{timestamp}:R>\nУчасники: **{entries}**",resultTitle:"Розіграш завершено",winner:"🎉 Переможець(ці): {winners}\nПриз: {prize}",none:"🎉 Немає учасників.\nПриз: {prize}"},
  ja: {join:"🎉 参加する",joined:"🎉 参加登録しました！",already:"すでに参加しています。",closed:"この抽選は終了しました。",started:"🎉 抽選を開始しました。",dbRequired:"抽選にはデータベース接続が必要です。",createFailed:"抽選を作成できませんでした。もう一度お試しください。",invalidDuration:"例：10m、2h、1d。最大28日です。",title:"🎉 抽選：{prize}",details:"当選者数：**{winners}**\n終了：<t:{timestamp}:R>\n参加者：**{entries}**",resultTitle:"抽選終了",winner:"🎉 当選者：{winners}\n賞品：{prize}",none:"🎉 参加者はいません。\n賞品：{prize}"},
  ko: {join:"🎉 참여하기",joined:"🎉 참여가 등록되었습니다!",already:"이미 참여했습니다.",closed:"이 추첨은 종료되었습니다.",started:"🎉 추첨이 시작되었습니다.",dbRequired:"추첨에는 데이터베이스 연결이 필요합니다.",createFailed:"추첨을 만들 수 없습니다. 다시 시도해 주세요.",invalidDuration:"예: 10m, 2h, 1d. 최대 28일입니다.",title:"🎉 추첨: {prize}",details:"당첨자 수: **{winners}**\n종료: <t:{timestamp}:R>\n참여자: **{entries}**",resultTitle:"추첨 종료",winner:"🎉 당첨자: {winners}\n상품: {prize}",none:"🎉 참여자가 없습니다.\n상품: {prize}"},
  zh: {join:"🎉 参与抽奖",joined:"🎉 已成功参与！",already:"你已经参与了。",closed:"本次抽奖已结束。",started:"🎉 抽奖已开始。",dbRequired:"抽奖功能需要数据库连接。",createFailed:"无法创建抽奖，请重试。",invalidDuration:"例如：10m、2h 或 1d。最长 28 天。",title:"🎉 抽奖：{prize}",details:"获奖人数：**{winners}**\n结束时间：<t:{timestamp}:R>\n参与人数：**{entries}**",resultTitle:"抽奖结束",winner:"🎉 获奖者：{winners}\n奖品：{prize}",none:"🎉 没有参与者。\n奖品：{prize}"}
};

function giveawayText(language, key, values = {}) {
  const locale = String(language || "da").toLowerCase();
  const dictionary = GIVEAWAY_TEXTS[locale] || GIVEAWAY_TEXTS.en;
  const template = dictionary[key] || GIVEAWAY_TEXTS.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

function hasCompleteGiveawayTranslations() {
  return Object.keys(GIVEAWAY_TEXTS).length === 18
    && Object.values(GIVEAWAY_TEXTS).every((dictionary) => KEYS.every((key) => typeof dictionary[key] === "string" && dictionary[key].length > 0));
}

module.exports = { DAY_MS, MAX_TIMER_DELAY_MS, GIVEAWAY_TEXTS, parseDuration, pickRandomWinners, timerDelayUntil, giveawayText, hasCompleteGiveawayTranslations };
