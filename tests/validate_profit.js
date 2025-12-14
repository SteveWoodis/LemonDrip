const fs = require("fs");

const r = JSON.parse(fs.readFileSync("./test_event_profit.json", "utf8"));
const n = (x) => Number(x || 0);

const grossSales = n(r.sales.grossSales);
const returns = n(r.sales.refunds);
const discounts = r.discounts.reduce((s,d)=>s+n(d.discountAmount),0);
const netSales = grossSales - returns - discounts;

const tips = r.tips.reduce((s,t)=>s+n(t.tipAmount),0);
const giftCardSales = n(r.eventInfo.giftCardSales);
const totalSales = netSales + tips + giftCardSales;

const cash = n(r.eventInfo.cash);
const card = n(r.eventInfo.card);
const venmo = n(r.eventInfo.venmo);
const other = n(r.eventInfo.other);
const cashApp = n(r.eventInfo.cashApp);

const totalCollected = cash + card + venmo + other + cashApp;

const foodTax = n(r.sales.squareReportedTax);
const squareFees = n(r.sales.squareFees);

const totalNetRevenue = totalCollected - foodTax - squareFees;

const expenses =
  n(r.eventInfo.healthDeptFee) +
  n(r.eventInfo.eventFee) +
  n(r.totals.suppliesTotal) +
  n(r.totals.additionalFees) +
  n(r.eventInfo.mileageReimbursement) +
  n(r.totals.laborTotal) +
  n(r.eventInfo.eventRunnerFees) +
  50;

const grossProfit = totalNetRevenue - expenses;

const coordinatorFee = grossProfit * 0.01;
const netProfitBeforeTax = grossProfit - coordinatorFee;

const federalTax = netSales * 0.20;
const stateTax = n(r.sales.squareReportedTax);

const finalProfit = netProfitBeforeTax - federalTax - stateTax;

console.log("Final Profit =", finalProfit);
