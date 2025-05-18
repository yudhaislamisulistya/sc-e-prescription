import axios from "axios";
import { CID } from "multiformats/cid";

export async function uploadToIPFS(data: string): Promise<string> {
    const formData = new FormData();
    const file = new Blob([data], { type: "text/plain" });
    formData.append("file", file, "file.txt");

    const response = await axios.post("http://202.43.249.78:5001/api/v0/add?cid-version=1&wrap-with-directory=true", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });

    const lines = response.data.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const lastJson = JSON.parse(lastLine);

    const cidV1 = CID.parse(lastJson.Hash).toV1().toString();

    return cidV1;
}
