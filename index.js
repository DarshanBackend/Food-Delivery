'use strict'
import express, { json } from 'express';
import { config } from 'dotenv'; config();
import logger from 'morgan';
import { connectDB } from './DB/connectdb.js';
import mongoose from 'mongoose';
import IndexRoute from './routes/index.routes.js';


//connect DB
const DB_URL = process.env.DB_URL || "mongodb+srv://akshayvaghasiya814:aksh2002@cluster0.se95gol.mongodb.net/fastcart"
connectDB(DB_URL)

//express instance
const app = express();

//comman middlware
app.use(express.json()); //for json transction
app.use(express.urlencoded({ extended: true }));
app.use(logger("common")); //for logging all apis and thire response in console.
app.use(express.urlencoded({ extended: true }));

//port define
const PORT = process.env.PORT || 9000;

//home route
app.get("/", async (req, res) => {
    return res.send("<h1>Food Delivery Api's Is Working...!</h1>")
});

//server health check
app.get("/health", async (req, res) => {
    const dbState = mongoose.connection.readyState;
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const dbStatus =
        dbState === 1
            ? "connected"
            : dbState === 2
                ? "connecting"
                : dbState === 3
                    ? "disconnecting"
                    : "disconnected";

    res.json({
        server: "running",
        database: dbStatus,
        timestamp: new Date(),
    });
});

//apis
app.use("/api", IndexRoute)

//server listing
app.listen(PORT, () => {
    console.log(`✅ Server iS Running On PORT : ${PORT}`);
})