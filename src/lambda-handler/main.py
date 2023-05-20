from fastapi import FastAPI
from api.api_v1.api import router as api_router
from mangum import Mangum


app = FastAPI(
    title="Chat GPT",
    version="0.1.0",
    docs_url='/docs',
    openapi_url='/openapi.json',
    redoc_url=None
)


@app.get("/")
async def root():
    return {"message": "FastAPI running in a Lambda function"}


@app.get("/chat_gpt/")
async def read_chatgpt(question: str = None):
    return {"message": f"We got question: {question}"}


app.include_router(api_router, prefix="/api/v1")


handler = Mangum(app)
