// ShardNote entry point
// Load the SellAuth integration before the Express app registers its routes.
require("./src/sellauth-hook.js");
require("./src/index.js");
