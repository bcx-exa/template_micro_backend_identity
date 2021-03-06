/* eslint-disable */
import express, { Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import bodyParser from "body-parser";
import { execShellCommand } from "./components/cli/shell";
//import xrayExpress from "aws-xray-sdk-express";
import dotenv from "dotenv-flow";
import { credsConfigLocal } from "./components/security/aws";
import path from "path";
import cors from "cors";
import passport from "passport";
import cookieParser from "cookie-parser";
import ejs from "ejs";
import { registerStrategies } from "./middelware/passport/passport";
import { globalErrorHandler } from "./components/handlers/error-handling";
import session from 'express-session';
import { router as authRouter } from './routes-override/authentication';
import { router as authzRouter } from './routes-override/authorization';

export class Server {
  public app: any;

  constructor() {
    //Express and body Parser
    this.app = express();
  }

  public async Stop(): Promise<void> {
    this.app.close();
  }
  public async Start(): Promise<void> {
    try {
      //Import env variables
      console.log("Starting Express Server");
      dotenv.config({ path: path.resolve(process.cwd(), "./environments/") });
      const env = process.env.NODE_ENV || "local";

      //Configure AWS Creds
      if (env == "local") {
        credsConfigLocal();
      }

      // Body parser
      this.app.use(bodyParser.urlencoded({ extended: true }));
      this.app.use(bodyParser.json());

      // Initiate view engine
      this.app.engine("ejs", ejs.__express);
      this.app.set("view engine", "ejs");
      this.app.set("views", path.join(__dirname, "./views"));
      this.app.use(cookieParser());
      this.app.use(session({ secret: "keyboard cat", resave: false, saveUninitialized: false }));

      //Allow Cors
      console.log("Enabling CORS");
      this.app.use(cors());

      //X-ray Segment Start
      console.log("Open X-Ray Segment");
      const appName = process.env.APP_NAME || "micro-base";
      //this.app.use(xrayExpress.openSegment(appName + "-startup"));

      //Add Passport Middelware to all routes
      console.log("Register & Initialize Passport Strategies");
      registerStrategies();
      this.app.use(passport.initialize());
      this.app.use(passport.session());

      // Route Overrides
      console.log("Route Overrides");
      this.app.use('/auth', authRouter);
      this.app.use('/oauth', authzRouter);

      //Generate tsoa routes & spec
      if (env === "local") {
        await execShellCommand("npm run tsoa");
      }

      //Register tsoa routes
      const routesTSOA = await import("./middelware/tsoa/routes");
      routesTSOA.RegisterRoutes(this.app);

      //Swagger-UI
      this.app.use('/', swaggerUi.serve, async (_req: Request, res: Response) => {
        return res.send(swaggerUi.generateHTML(await import("./middelware/tsoa/swagger.json")));
      });
      //X-Ray Segment End
      console.log("Ending X-Ray Segment");
      //this.app.use(xrayExpress.closeSegment());

      // Global Error handling
      console.log("Adding Global Error Handling");
      this.app.use(globalErrorHandler);


      //Start Express Server
      if (env === "local" || env === "test") {
        const port = env === 'test' ? 5000 : 7000;
        const server = this.app.listen(port, () => {
          console.log(`Server listening on port http://localhost:${port}`);
        });
        return server;
      }
    } catch (e) {
      console.error(e);
    }
  }
}
