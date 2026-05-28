'use strict'
import express, { json } from 'express';
import { config } from 'dotenv'; config();
import logger from 'morgan';
import { connectDB } from './DB/connectdb.js';
import mongoose from 'mongoose';
import IndexRoute from './routes/index.routes.js';



const DB_URL = process.env.DB_URL || "mongodb+srv://akshayvaghasiya814:aksh2002@cluster0.se95gol.mongodb.net/fastcart"
connectDB(DB_URL)


const app = express();


app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(logger("common")); 
app.use(express.urlencoded({ extended: true }));


const PORT = process.env.PORT || 9000;


app.get("/", async (req, res) => {
    return res.send("<h1>Food Delivery Api's Is Working...!</h1>")
});


app.get("/health", async (req, res) => {
    const dbState = mongoose.connection.readyState;
    
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


app.use("/api", IndexRoute)


app.listen(PORT, () => {
    console.log(`✅ Server iS Running On PORT : ${PORT}`);
})