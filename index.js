const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require("body-parser");

const checkAuthorization = require("./common/middleware/auth_middleware");

const app = express();
app.set("trust proxy", true);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(cors());
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  }),
);

app.use("/uploads", express.static(process.env.FILE_URL || "E:/upload_palma"));

app.use("/api/auth/auth", require("./features/auth/route"));
app.use(
  "/api/auth/users",
  checkAuthorization,
  require("./features/user/route"),
);
app.use(
  "/api/auth/roles",
  checkAuthorization,
  require("./features/role/route"),
);
app.use(
  "/api/auth/menus",
  checkAuthorization,
  require("./features/menu/route"),
);
app.use(
  "/api/auth/db-admin-verifikator-lp",
  checkAuthorization,
  require("./features/db-admin-verifikator/route"),
);

app.use(
  "/api/auth/db-admin-verifikator-dinas",
  checkAuthorization,
  require("./features/db-admin-verifikator-dinas/route"),
);

module.exports = app;
