const supertokens = require("supertokens-node");
const EmailPassword = require("supertokens-node/recipe/emailpassword");
const Session = require("supertokens-node/recipe/session");

supertokens.init({
  framework: "express",
  supertokens: {
    connectionURI: process.env.SUPERTOKENS_CONNECTION_URI,
    apiKey: process.env.SUPERTOKENS_API_KEY,
  },
  appInfo: {
    appName: "VenView Events",
    apiDomain: "http://localhost:8080",
    websiteDomain: "http://localhost:8080",
  },
  recipeList: [EmailPassword.init(), Session.init()],
});

(async () => {
  const user = await supertokens.listUsersByAccountInfo("public", { email: "venview_admin@gmail.com" });
  if (!user.length) return console.log("User not found");
  const recipeUserId = user[0].loginMethods[0].recipeUserId;
  await EmailPassword.updateEmailOrPassword({ recipeUserId, password: "venview@pwLdrip1431$" });
  console.log("✅ Password updated");
  process.exit(0);
})();