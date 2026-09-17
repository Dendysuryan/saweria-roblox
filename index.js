require("dotenv").config();

const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const SAWERIA_STREAM_KEY =
    process.env.SAWERIA_STREAM_KEY;

const ROBLOX_SECRET =
    process.env.ROBLOX_SECRET;


/*
====================================================
JSON BODY
====================================================
*/

app.use(
    express.json({
        limit: "100kb"
    })
);


/*
====================================================
DONATION DATABASE SEMENTARA
====================================================
*/

const donations = [];

const processedIds = new Set();

const MAX_DONATIONS = 500;


/*
====================================================
HOME
====================================================
*/

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "Saweria Roblox Backend",
        time: new Date().toISOString()
    });

});


/*
====================================================
VERIFY SAWERIA SIGNATURE
====================================================
*/

function verifySaweriaSignature(req) {

    const signature =
        req.headers[
            "saweria-callback-signature"
        ];

    if (!signature) {
        return false;
    }


    const body = req.body;


    const message =
        String(body.version || "") +
        String(body.id || "") +
        String(body.amount_raw || "") +
        String(body.donator_name || "") +
        String(body.donator_email || "");


    const expected =
        crypto
            .createHmac(
                "sha256",
                SAWERIA_STREAM_KEY
            )
            .update(message)
            .digest("hex");


    if (
        signature.length !==
        expected.length
    ) {
        return false;
    }


    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
    );

}


/*
====================================================
SAWERIA WEBHOOK
====================================================
*/

app.post(
    "/webhook/saweria",
    (req, res) => {

        try {

            console.log(
                "[SAWERIA] Webhook received"
            );


            /*
            ----------------------------------------
            VERIFY SIGNATURE
            ----------------------------------------
            */

            if (
                !verifySaweriaSignature(req)
            ) {

                console.log(
                    "[SAWERIA] Invalid signature"
                );

                return res
                    .status(401)
                    .json({
                        success: false,
                        error:
                            "Invalid signature"
                    });

            }


            const donation =
                req.body;


            /*
            ----------------------------------------
            CHECK EVENT TYPE
            ----------------------------------------
            */

            if (
                donation.type !==
                "donation"
            ) {

                return res.json({
                    success: true,
                    ignored: true
                });

            }


            /*
            ----------------------------------------
            TRANSACTION ID
            ----------------------------------------
            */

            const id =
                String(
                    donation.id
                );


            /*
            ----------------------------------------
            ANTI DUPLICATE
            ----------------------------------------
            */

            if (
                processedIds.has(id)
            ) {

                console.log(
                    "[SAWERIA] Duplicate:",
                    id
                );

                return res.json({
                    success: true,
                    duplicate: true
                });

            }


            /*
            ----------------------------------------
            NORMALIZE
            ----------------------------------------
            */

            const data = {

                id,

                amount:
                    Number(
                        donation.amount_raw ||
                        0
                    ),

                donator:
                    String(
                        donation.donator_name ||
                        "Anonymous"
                    ),

                email:
                    String(
                        donation.donator_email ||
                        ""
                    ),

                message:
                    String(
                        donation.message ||
                        ""
                    ),

                createdAt:
                    donation.created_at ||
                    new Date().toISOString(),

                processed:
                    false

            };


            /*
            ----------------------------------------
            SAVE
            ----------------------------------------
            */

            donations.push(data);

            processedIds.add(id);


            /*
            ----------------------------------------
            LIMIT STORAGE
            ----------------------------------------
            */

            while (
                donations.length >
                MAX_DONATIONS
            ) {

                donations.shift();

            }


            console.log(
                "================================"
            );

            console.log(
                "[DONATION]"
            );

            console.log(
                "ID:",
                data.id
            );

            console.log(
                "Donator:",
                data.donator
            );

            console.log(
                "Amount:",
                data.amount
            );

            console.log(
                "Message:",
                data.message
            );

            console.log(
                "================================"
            );


            return res.json({

                success: true,

                received: true,

                id: data.id

            });

        }

        catch (error) {

            console.error(
                "[ERROR]",
                error
            );

            return res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Internal server error"

                });

        }

    }
);


/*
====================================================
ROBLOX AUTH
====================================================
*/

function verifyRoblox(req) {

    const secret =
        req.headers[
            "x-roblox-secret"
        ];

    return (
        secret &&
        secret === ROBLOX_SECRET
    );

}


/*
====================================================
ROBLOX GET DONATIONS
====================================================
*/

app.get(
    "/api/roblox/donations",
    (req, res) => {

        if (
            !verifyRoblox(req)
        ) {

            return res
                .status(401)
                .json({
                    success: false,
                    error:
                        "Unauthorized"
                });

        }


        const limit =
            Math.min(
                Number(
                    req.query.limit
                ) || 10,
                50
            );


        const pending =
            donations
                .filter(
                    donation =>
                        !donation.processed
                )
                .slice(
                    0,
                    limit
                );


        /*
        ----------------------------------------
        MARK PROCESSED
        ----------------------------------------
        */

        for (
            const donation
            of pending
        ) {

            donation.processed =
                true;

        }


        res.json({

            success: true,

            count:
                pending.length,

            donations:
                pending

        });

    }
);


/*
====================================================
ROBLOX STATUS
====================================================
*/

app.get(
    "/api/roblox/status",
    (req, res) => {

        if (
            !verifyRoblox(req)
        ) {

            return res
                .status(401)
                .json({
                    success: false
                });

        }


        const pending =
            donations.filter(
                donation =>
                    !donation.processed
            ).length;


        res.json({

            success: true,

            status: "online",

            total:
                donations.length,

            pending

        });

    }
);


/*
====================================================
START
====================================================
*/

app.listen(
    PORT,
    () => {

        console.log(
            `Saweria backend running on port ${PORT}`
        );

    }
);