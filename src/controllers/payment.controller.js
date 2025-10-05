export const getanks = async (req, res) => {
  try {
    const response = await fetch("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching banks from Paystack:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const verifyAccount = async (req, res) => {
  const { account_number, bank_code } = req.query;

  if (!account_number || !bank_code) {
    return res
      .status(400)
      .json({ error: "Missing account number or bank code" });
  }

  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await paystackRes.json();

    if (!data.status) {
      return res.status(400).json({ error: data.message });
    }

    return res.json({
      accountName: data.data.account_name,
      accountNumber: data.data.account_number,
      bankCode: bank_code,
    });
  } catch (error) {
    console.error("Paystack error:", error);
    return res.status(500).json({ error: "Server error verifying account" });
  }
};
