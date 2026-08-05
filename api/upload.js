export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method Not Allowed"
        });
    }

    try {

        const response = await fetch(
            "https://script.google.com/macros/s/AKfycbyLRLeDMmp2ugwHlt4lx_1yXP8M0J9jkuXD7D6_VcSkWUKgQzjPMKs5bxeP_6p8ni6A_w/exec",
            {
                method: "POST",
                headers: {
                    "Content-Type":"text/plain;charset=utf-8"
                },
                body: JSON.stringify(req.body)
            }
        );

        const text = await response.text();

        return res.status(200).send(text);

    } catch(err){

        return res.status(500).json({
            error:err.message
        });

    }

}