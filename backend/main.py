from fastapi import (
    FastAPI,
    Header,
    HTTPException,
    Depends,
)
from fastapi.middleware.cors import CORSMiddleware
from typing import List

from pydantic import BaseModel
from backend.database import (
    initialize_database,
    get_db_connection,
)
from backend.anomaly_detection_service import (
    run_anomaly_detection,
)
from backend.optimization_service import (
    OptimizationPreviewServiceError,
    run_naver_optimization_preview,
)

import jwt
import requests
from urllib.parse import urlparse
import time
import hashlib
import hmac
import base64
import os
import json
import math
import secrets
import gurobipy as gp
from gurobipy import GRB
import uuid
from datetime import datetime, timedelta, timezone



from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = (
    Path(__file__).resolve().parent
    / ".env"
)

load_dotenv(
    dotenv_path=ENV_PATH
)

JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY"
)

JWT_ALGORITHM = os.getenv(
    "JWT_ALGORITHM",
    "HS256",
)

JWT_ACCESS_TOKEN_EXPIRE_HOURS = int(
    os.getenv(
        "JWT_ACCESS_TOKEN_EXPIRE_HOURS",
        "12",
    )
)

if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY가 설정되지 않았습니다."
    )

def create_operator_access_token(
    operator_id: str,
    email: str,
) -> str:
    now = datetime.utcnow()

    payload = {
        "sub": operator_id,
        "email": email,
        "role": "operator",
        "iat": now,
        "exp": now + timedelta(
            hours=JWT_ACCESS_TOKEN_EXPIRE_HOURS
        ),
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )

def decode_operator_access_token(
    authorization: str | None,
):
    if not authorization:
        return None

    prefix = "Bearer "

    if not authorization.startswith(prefix):
        return None

    token = authorization[len(prefix):].strip()

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        if payload.get("role") != "operator":
            return None

        return payload

    except jwt.PyJWTError:
        return None


def hash_client_password(password: str) -> str:
    salt = os.urandom(16)

    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        200_000,
    )

    return f"{salt.hex()}:" f"{password_hash.hex()}"


def verify_client_password(
    password: str,
    stored_password_hash: str,
) -> bool:
    try:
        salt_hex, hash_hex = stored_password_hash.split(":", 1)

        salt = bytes.fromhex(salt_hex)

        expected_hash = bytes.fromhex(hash_hex)

        actual_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            200_000,
        )

        return hmac.compare_digest(
            actual_hash,
            expected_hash,
        )

    except (ValueError, TypeError):
        return False


def create_naver_signature(
    timestamp: str,
    method: str,
    uri: str,
    secret_key: str,
) -> str:
    message = f"{timestamp}.{method}.{uri}"

    signature = hmac.new(
        secret_key.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    return base64.b64encode(signature).decode("utf-8")


app = FastAPI(
    title="Ad Budget Optimization API",
    version="0.1.0",
)

initialize_database()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def create_client_access_token(
    user_id: str,
    client_id: str,
    email: str,
) -> str:
    now = datetime.utcnow()

    payload = {
        "sub": user_id,
        "clientId": client_id,
        "email": email,
        "role": "client",
        "iat": now,
        "exp": now + timedelta(
            hours=JWT_ACCESS_TOKEN_EXPIRE_HOURS
        ),
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def decode_client_access_token(
    authorization: str | None,
):
    if not authorization:
        return None

    prefix = "Bearer "

    if not authorization.startswith(prefix):
        return None

    token = authorization[
        len(prefix):
    ].strip()

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[
                JWT_ALGORITHM
            ],
        )

        if payload.get("role") != "client":
            return None

        if not payload.get("sub"):
            return None

        if not payload.get("clientId"):
            return None

        return payload

    except jwt.PyJWTError:
        return None

def require_operator_access_token(
    authorization: str | None,
):
    token_payload = (
        decode_operator_access_token(
            authorization
        )
    )

    if token_payload is None:
        raise HTTPException(
            status_code=401,
            detail="로그인이 필요합니다.",
        )

    operator_id = token_payload.get(
        "sub"
    )

    if not operator_id:
        raise HTTPException(
            status_code=401,
            detail="운영자 정보를 확인할 수 없습니다.",
        )

    return token_payload


def require_client_access_token(
    authorization: str | None,
):
    token_payload = (
        decode_client_access_token(
            authorization
        )
    )

    if token_payload is None:
        raise HTTPException(
            status_code=401,
            detail="로그인이 필요합니다.",
        )

    client_id = token_payload.get(
        "clientId"
    )

    user_id = token_payload.get(
        "sub"
    )

    if not client_id or not user_id:
        raise HTTPException(
            status_code=401,
            detail="Client 정보를 확인할 수 없습니다.",
        )

    return token_payload

def require_operator_access_token(
    authorization: str | None,
):
    token_payload = decode_operator_access_token(
        authorization
    )

    if token_payload is None:
        raise HTTPException(
            status_code=401,
            detail="로그인이 필요합니다.",
        )

    operator_id = token_payload.get("sub")

    if not operator_id:
        raise HTTPException(
            status_code=401,
            detail="운영자 정보를 확인할 수 없습니다.",
        )

    return token_payload


def require_client_access_token(
    authorization: str | None,
):
    token_payload = decode_client_access_token(
        authorization
    )

    if token_payload is None:
        raise HTTPException(
            status_code=401,
            detail="로그인이 필요합니다.",
        )

    client_id = token_payload.get(
        "clientId"
    )

    user_id = token_payload.get(
        "sub"
    )

    if not client_id or not user_id:
        raise HTTPException(
            status_code=401,
            detail="Client 정보를 확인할 수 없습니다.",
        )

    return token_payload

def require_operator(
    authorization: str | None = Header(default=None),
):
    token_payload = decode_operator_access_token(
        authorization
    )

    if token_payload is None:
        raise HTTPException(
            status_code=401,
            detail="로그인이 필요합니다.",
        )

    operator_id = token_payload.get(
        "sub"
    )

    if not operator_id:
        raise HTTPException(
            status_code=401,
            detail="운영자 정보를 확인할 수 없습니다.",
        )

    return token_payload


def require_client(
    authorization: str | None = Header(default=None),
):
    token_payload = decode_client_access_token(
        authorization
    )

    if token_payload is None:
        raise HTTPException(
            status_code=401,
            detail="로그인이 필요합니다.",
        )

    client_id = token_payload.get(
        "clientId"
    )

    user_id = token_payload.get(
        "sub"
    )

    if not client_id or not user_id:
        raise HTTPException(
            status_code=401,
            detail="Client 정보를 확인할 수 없습니다.",
        )

    return token_payload

def require_authenticated_user(
    authorization: str | None = Header(default=None),
):
    operator_payload = (
        decode_operator_access_token(
            authorization
        )
    )

    if operator_payload is not None:
        return operator_payload

    client_payload = (
        decode_client_access_token(
            authorization
        )
    )

    if client_payload is not None:
        return client_payload

    raise HTTPException(
        status_code=401,
        detail="로그인이 필요합니다.",
    )

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "optimization-api",
    }


class VariableModel(BaseModel):
    name: str
    channel: str
    segmentIndex: int
    lb: float
    ub: float
    objectiveCoefficient: float


class CoefficientModel(BaseModel):
    variable: str
    coefficient: float


class ConstraintModel(BaseModel):
    name: str
    sense: str
    rhs: float
    coefficients: List[CoefficientModel]


class ObjectiveModel(BaseModel):
    sense: str
    metric: str


class BudgetModel(BaseModel):
    daily: float
    periodDays: int
    total: float


class ChannelBudgetModel(BaseModel):
    channel: str
    currentBudget: float


class ChannelRiskMetricModel(BaseModel):
    channel: str
    riskWeight: float
    volatility: float


class SolverModelPayload(BaseModel):
    advertiserId: str
    modelName: str
    modelType: str
    objective: ObjectiveModel
    budget: BudgetModel
    variables: List[VariableModel]
    constraints: List[ConstraintModel]
    riskLevel: str | None = None
    channelBudgets: List[ChannelBudgetModel]
    channelRiskMetrics: List[ChannelRiskMetricModel]


class ClientLoginPayload(BaseModel):
    email: str
    password: str

class OperatorSignupPayload(BaseModel):
    email: str
    password: str
    name: str | None = None


class OperatorLoginPayload(BaseModel):
    email: str
    password: str


class ClientUserCreatePayload(BaseModel):
    clientId: str
    advertiserId: str
    clientName: str
    brandName: str | None = None
    email: str
    password: str
    name: str | None = None

class ClientAdvertiserAssignPayload(BaseModel):
    advertiserId: str


class ClientProposalPayload(BaseModel):
    id: str
    advertiserId: str | None = None
    clientId: str | None = None
    scenarioId: str | None = None
    scenarioName: str | None = None
    totalBudget: float | None = None
    clientResponse: str | None = None

    status: str = "preparing"

    assignee: str | None = None
    dueDate: str | None = None
    taskStatus: str = "waiting"

    shareToken: str | None = None
    shareUrl: str | None = None
    shareStatus: str = "not_shared"

    sharedAt: str | None = None
    firstViewedAt: str | None = None
    lastViewedAt: str | None = None
    viewCount: int = 0

    createdAt: str
    updatedAt: str

    summary: dict | None = None
    allocations: list = []
    messages: list = []
    history: list = []

    clientComment: str | None = None
    internalNote: str | None = None
    revisionReason: str | None = None

    priority: str = "normal"


class ClientProposalPatchPayload(BaseModel):
    status: str | None = None

    assignee: str | None = None
    dueDate: str | None = None
    taskStatus: str | None = None
    priority: str | None = None

    clientComment: str | None = None
    internalNote: str | None = None
    revisionReason: str | None = None

    shareToken: str | None = None
    shareUrl: str | None = None
    shareStatus: str | None = None

    sharedAt: str | None = None
    firstViewedAt: str | None = None
    lastViewedAt: str | None = None
    viewCount: int | None = None

    totalBudget: float | None = None
    summary: dict | None = None
    allocations: list[dict] | None = None

    previousRevision: dict | None = None

    trashStatus: str | None = None
    trashedAt: str | None = None

    updatedAt: str | None = None

    clientId: str | None = None


class ProposalMessagePayload(BaseModel):
    id: str
    proposalId: str

    senderType: str
    senderName: str | None = None

    message: str

    actionUrl: str | None = None
    actionLabel: str | None = None

    createdAt: str

    isRead: bool | None = False
    readAt: str | None = None


class ProposalMessagesReadPayload(BaseModel):
    readerType: str


class AdConnectionPayload(BaseModel):
    id: str
    advertiserId: str 
    platform: str

    apiUrl: str | None = None

    accountId: str | None = None
    accountName: str | None = None

    status: str = "disconnected"

    accessToken: str | None = None
    refreshToken: str | None = None

    secretKey: str | None = None
    customerId: str | None = None

    tokenExpiresAt: str | None = None

    lastSyncedAt: str | None = None

    createdAt: str
    updatedAt: str


class ProposalEventPayload(BaseModel):
    id: str
    proposalId: str

    eventType: str
    status: str | None = None
    message: str | None = None

    createdAt: str


class SharedProposalActionPayload(BaseModel):
    action: str
    message: str | None = None


class NaverConnectionTestPayload(BaseModel):
    accessLicense: str
    secretKey: str
    customerId: str


class NaverStatsSyncPayload(BaseModel):
    since: str
    until: str


class NaverDailyReportPayload(BaseModel):
    date: str
    advertiserId: str | None = None


class NaverPerformanceRangePayload(BaseModel):
    since: str
    until: str
    advertiserId: str | None = None


class NaverHistoryProbePayload(BaseModel):
    date: str
    advertiserId: str | None = None


class NaverHistoryCoveragePayload(BaseModel):
    maxLookbackDays: int = 730
    stepDays: int = 30
    probeWindowDays: int = 3
    advertiserId: str | None = None

class CampaignBudgetConstraintModel(
    BaseModel
):
    campaignId: str

    minDailyBudget: float
    maxDailyBudget: float


class CampaignBudgetPolicyUpdatePayload(
    BaseModel
):
    advertiserId: str

    policies: List[
        CampaignBudgetConstraintModel
    ]

class CampaignBudgetScalingPreviewPayload(
    BaseModel
):
    advertiserId: str

    dataSource: str = "naver"

    maxBudgetChangePct: float = 0.30

    budgetMultipliers: List[
        float
    ] = [
        0.80,
        0.90,
        1.00,
        1.10,
        1.20,
        1.30,
    ]

    performanceRecords: (
        list[dict] | None
    ) = None

    currentBudgets: (
        dict[str, float] | None
    ) = None

    budgetBounds: (
        dict[
            str,
            dict[str, float]
        ] | None
    ) = None

    mockTotalDailyBudget: (
        float | None
    ) = None

    revenueValidStartDate: (
        str | None
    ) = None

    filters: (
        dict | None
    ) = None


class NaverOptimizationPreviewPayload(BaseModel):
    advertiserId: str
    accountId: str | None = None
    maxBudgetChangePct: float = 0.30


class ChannelOptimizationReadinessPayload(BaseModel):
    advertiserId: str
    maxBudgetChangePct: float = 0.30


class ChannelOptimizationPreviewPayload(BaseModel):
    advertiserId: str
    maxBudgetChangePct: float = 0.30

    dataSource: str = "naver"

    performanceRecords: List[
        dict
    ] | None = None

    revenueValidStartDates: dict[
        str,
        str,
    ] | None = None


class AdvertiserCreatePayload(BaseModel):
    name: str
    companyName: str | None = None
    contactName: str | None = None
    contactEmail: str | None = None
    contactPhone: str | None = None


class AdvertiserPatchPayload(BaseModel):
    name: str | None = None
    companyName: str | None = None
    status: str | None = None
    contactName: str | None = None
    contactEmail: str | None = None
    contactPhone: str | None = None


class AdvertiserConnectionAssignPayload(BaseModel):
    connectionId: str


class NaverBackfillStartPayload(BaseModel):
    startDate: str | None = None
    advertiserId: str | None = None


class NaverBackfillProcessPayload(BaseModel):
    batchDays: int = 7
    advertiserId: str | None = None


class NaverBackfillRetryPayload(BaseModel):
    maxRetries: int = 3
    advertiserId: str | None = None




@app.post("/client-proposals")
def create_client_proposal(
    payload: ClientProposalPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        raise HTTPException(
            status_code=400,
            detail="advertiserId가 필요합니다.",
        )

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=
                    "해당 광고주에 접근할 권한이 없습니다.",
            )

        if payload.clientId:
            client_row = connection.execute(
                """
                SELECT
                    client_id,
                    advertiser_id
                FROM client_users
                WHERE client_id = ?
                LIMIT 1
                """,
                (
                    payload.clientId,
                ),
            ).fetchone()

            if (
                client_row is None
                or client_row[
                    "advertiser_id"
                ] != payload.advertiserId
            ):
                raise HTTPException(
                    status_code=400,
                    detail=
                        "해당 Client는 선택한 광고주에 연결되어 있지 않습니다.",
                )

        proposal_data = payload.model_dump()

        connection.execute(
            """
            INSERT OR REPLACE INTO client_proposals (
                id,
                advertiser_id,
                client_id,
                scenario_id,
                scenario_name,
                status,
                assignee,
                due_date,
                task_status,
                share_token,
                share_url,
                share_status,
                shared_at,
                first_viewed_at,
                last_viewed_at,
                view_count,
                created_at,
                updated_at,
                proposal_json
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            """,
            (
                payload.id,
                payload.advertiserId,
                payload.clientId,
                payload.scenarioId,
                payload.scenarioName,
                payload.status,
                payload.assignee,
                payload.dueDate,
                payload.taskStatus,
                payload.shareToken,
                payload.shareUrl,
                payload.shareStatus,
                payload.sharedAt,
                payload.firstViewedAt,
                payload.lastViewedAt,
                payload.viewCount,
                payload.createdAt,
                payload.updatedAt,
                json.dumps(
                    proposal_data,
                    ensure_ascii=False,
                ),
            ),
        )

        connection.commit()

        return {
            "status": "saved",
            "advertiserId":
                payload.advertiserId,
            "proposal":
                proposal_data,
        }

    finally:
        connection.close()


@app.post("/client-users")
def create_client_user(
    payload: ClientUserCreatePayload,
):
    connection = get_db_connection()

    try:
        now = datetime.now().isoformat()

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND status = 'active'
            """,
            (payload.advertiserId,),
        ).fetchone()

        if advertiser is None:
            return {
                "status": "advertiser_not_found",
                "message": "유효한 광고주를 찾을 수 없습니다.",
            }

        existing_user = connection.execute(
            """
            SELECT id
            FROM client_users
            WHERE email = ?
            """,
            (payload.email,),
        ).fetchone()

        if existing_user is not None:
            return {
                "status": "email_exists",
                "message": "이미 등록된 이메일입니다.",
            }

        connection.execute(
            """
            INSERT OR IGNORE INTO clients (
                id,
                name,
                brand_name,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                payload.clientId,
                payload.clientName,
                payload.brandName,
                now,
                now,
            ),
        )

        user_id = f"client_user_{uuid.uuid4().hex}"

        password_hash = hash_client_password(payload.password)

        connection.execute(
            """
            INSERT INTO client_users (
                id,
                client_id,
                advertiser_id,
                email,
                password_hash,
                name,
                role,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                payload.clientId,
                payload.advertiserId,
                payload.email,
                password_hash,
                payload.name,
                "client",
                now,
                now,
            ),
        )

        connection.commit()

        return {
            "status": "created",
            "clientId": payload.clientId,
            "advertiserId": payload.advertiserId,
            "email": payload.email,
        }

    finally:
        connection.close()



@app.patch("/client-users/{client_id}/advertiser")
def assign_client_user_advertiser(
    client_id: str,
    payload: ClientAdvertiserAssignPayload,
):
    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND status = 'active'
            """,
            (payload.advertiserId,),
        ).fetchone()

        if advertiser is None:
            return {
                "status": "advertiser_not_found",
                "message": "유효한 광고주를 찾을 수 없습니다.",
            }

        client_user = connection.execute(
            """
            SELECT id
            FROM client_users
            WHERE client_id = ?
            """,
            (client_id,),
        ).fetchone()

        if client_user is None:
            return {
                "status": "client_not_found",
                "message": "Client 계정을 찾을 수 없습니다.",
            }

        connection.execute(
            """
            UPDATE client_users
            SET
                advertiser_id = ?,
                updated_at = ?
            WHERE client_id = ?
            """,
            (
                payload.advertiserId,
                datetime.now().isoformat(),
                client_id,
            ),
        )

        connection.commit()

        return {
            "status": "updated",
            "clientId": client_id,
            "advertiserId": payload.advertiserId,
        }

    finally:
        connection.close()


@app.post("/client-auth/login")
def client_login(
    payload: ClientLoginPayload,
):
    connection = get_db_connection()

    try:
        user = connection.execute(
            """
            SELECT
                client_users.id,
                client_users.client_id,
                client_users.advertiser_id,
                client_users.email,
                client_users.password_hash,
                client_users.name,
                client_users.role,
                clients.name AS client_name,
                clients.brand_name
            FROM client_users
            LEFT JOIN clients
                ON clients.id =
                   client_users.client_id
            WHERE client_users.email = ?
            """,
            (payload.email,),
        ).fetchone()

        if user is None:
            return {
                "status": "invalid_credentials",
                "message": "이메일 또는 비밀번호가 올바르지 않습니다.",
            }

        if not verify_client_password(
            payload.password,
            user["password_hash"],
        ):
            return {
                "status": "invalid_credentials",
                "message": "이메일 또는 비밀번호가 올바르지 않습니다.",
            }

        if not user["advertiser_id"]:
            return {
                "status": "advertiser_not_assigned",
                "message": "이 Client 계정에 광고주가 연결되어 있지 않습니다.",
            }

        access_token = create_client_access_token(
            user_id=str(user["id"]),
            client_id=str(
                user["client_id"]
            ),
            email=user["email"],
        )



        return {
            "status": "authenticated",
            "accessToken": access_token,
            "tokenType": "bearer",
            "user": {
                "id": user["id"],
                "clientId":
                    user["client_id"],
                "advertiserId":
                    user["advertiser_id"],
                "email":
                    user["email"],
                "name":
                    user["name"],
                "role":
                    user["role"],
                "clientName":
                    user["client_name"],
                "brandName":
                    user["brand_name"],
            },
        }

    finally:
        connection.close()

@app.post("/operator-auth/signup")
def operator_signup(
    payload: OperatorSignupPayload,
):
    email = payload.email.strip().lower()
    password = payload.password
    name = payload.name.strip() if payload.name else None

    if not email:
        return {
            "status": "error",
            "message": "이메일을 입력해주세요.",
        }

    if not password or len(password) < 8:
        return {
            "status": "error",
            "message": "비밀번호는 8자 이상이어야 합니다.",
        }

    connection = get_db_connection()

    try:
        existing = connection.execute(
            """
            SELECT id
            FROM operator_users
            WHERE email = ?
            LIMIT 1
            """,
            (email,),
        ).fetchone()

        if existing is not None:
            return {
                "status": "duplicate",
                "message": "이미 가입된 이메일입니다.",
            }

        operator_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        password_hash = hash_client_password(
            password
        )

        connection.execute(
            """
            INSERT INTO operator_users (
                id,
                email,
                password_hash,
                name,
                role,
                status,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                operator_id,
                email,
                password_hash,
                name,
                "operator",
                "active",
                now,
                now,
            ),
        )

        connection.commit()

        return {
            "status": "ok",
            "message": "운영자 계정이 생성되었습니다.",
            "user": {
                "id": operator_id,
                "email": email,
                "name": name,
                "role": "operator",
                "status": "active",
            },
        }

    finally:
        connection.close()

@app.post("/operator-auth/login")
def operator_login(
    payload: OperatorLoginPayload,
):
    email = payload.email.strip().lower()

    connection = get_db_connection()

    try:
        user = connection.execute(
            """
            SELECT
                id,
                email,
                password_hash,
                name,
                role,
                status
            FROM operator_users
            WHERE email = ?
            LIMIT 1
            """,
            (email,),
        ).fetchone()

        if user is None:
            return {
                "status": "invalid_credentials",
                "message": "이메일 또는 비밀번호가 올바르지 않습니다.",
            }

        if user["status"] != "active":
            return {
                "status": "inactive",
                "message": "비활성화된 계정입니다.",
            }

        if not verify_client_password(
            payload.password,
            user["password_hash"],
        ):
            return {
                "status": "invalid_credentials",
                "message": "이메일 또는 비밀번호가 올바르지 않습니다.",
            }

        access_token = create_operator_access_token(
            user["id"],
            user["email"],
        )

        return {
            "status": "authenticated",
            "accessToken": access_token,
            "tokenType": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "role": user["role"],
                "status": user["status"],
            },
        }

    finally:
        connection.close()

@app.get("/operator-auth/me")
def get_operator_me(
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    connection = get_db_connection()

    try:
        user = connection.execute(
            """
            SELECT
                id,
                email,
                name,
                role,
                status
            FROM operator_users
            WHERE id = ?
            LIMIT 1
            """,
            (
                operator_id,
            ),
        ).fetchone()

        if user is None:
            raise HTTPException(
                status_code=401,
                detail="운영자 계정을 찾을 수 없습니다.",
            )

        if user["status"] != "active":
            raise HTTPException(
                status_code=403,
                detail="비활성화된 계정입니다.",
            )

        return {
            "status": "authenticated",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "role": user["role"],
                "status": user["status"],
            },
        }

    finally:
        connection.close()


@app.get("/client-proposals")
def get_client_proposals(
    clientId: str | None = None,
    advertiserId: str | None = None,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        raise HTTPException(
            status_code=400,
            detail="advertiserId가 필요합니다.",
        )

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        if clientId:
            rows = connection.execute(
                """
                SELECT proposal_json
                FROM client_proposals
                WHERE advertiser_id = ?
                  AND client_id = ?
                ORDER BY updated_at DESC
                """,
                (
                    advertiserId,
                    clientId,
                ),
            ).fetchall()

        else:
            rows = connection.execute(
                """
                SELECT proposal_json
                FROM client_proposals
                WHERE advertiser_id = ?
                ORDER BY updated_at DESC
                """,
                (
                    advertiserId,
                ),
            ).fetchall()

        proposals = []

        for row in rows:
            if not row["proposal_json"]:
                continue

            proposals.append(
                json.loads(
                    row["proposal_json"]
                )
            )

        return {
            "status": "ok",
            "advertiserId":
                advertiserId,
            "clientId":
                clientId,
            "proposals":
                proposals,
        }

    finally:
        connection.close()

@app.get("/operator-client-proposals")
def get_operator_client_proposals(
    advertiserId: str,
    clientId: str | None = None,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=
                    "해당 광고주에 접근할 권한이 없습니다.",
            )

        if clientId:
            rows = connection.execute(
                """
                SELECT proposal_json
                FROM client_proposals
                WHERE advertiser_id = ?
                  AND client_id = ?
                ORDER BY updated_at DESC
                """,
                (
                    advertiserId,
                    clientId,
                ),
            ).fetchall()

        else:
            rows = connection.execute(
                """
                SELECT proposal_json
                FROM client_proposals
                WHERE advertiser_id = ?
                ORDER BY updated_at DESC
                """,
                (
                    advertiserId,
                ),
            ).fetchall()

        proposals = []

        for row in rows:
            if not row["proposal_json"]:
                continue

            proposals.append(
                json.loads(
                    row["proposal_json"]
                )
            )

        return {
            "status": "ok",
            "advertiserId": advertiserId,
            "clientId": clientId,
            "proposals": proposals,
        }

    finally:
        connection.close()

@app.get("/client-portal/proposals")
def get_client_portal_proposals(
    token_payload = Depends(
        require_client
    ),
):
    client_id = token_payload.get(
        "clientId"
    )

    user_id = token_payload.get(
        "sub"
    )

    connection = get_db_connection()

    try:
        client_user = connection.execute(
            """
            SELECT
                id,
                client_id,
                advertiser_id
            FROM client_users
            WHERE id = ?
              AND client_id = ?
            LIMIT 1
            """,
            (
                user_id,
                client_id,
            ),
        ).fetchone()

        if client_user is None:
            return {
                "status": "client_not_found",
                "message": "Client 계정을 찾을 수 없습니다.",
                "proposals": [],
            }

        if not client_user["advertiser_id"]:
            return {
                "status": "advertiser_not_assigned",
                "message": "이 Client 계정에 광고주가 연결되어 있지 않습니다.",
                "proposals": [],
            }

        rows = connection.execute(
            """
            SELECT proposal_json
            FROM client_proposals
            WHERE client_id = ?
              AND advertiser_id = ?
            ORDER BY updated_at DESC
            """,
            (
                client_user["client_id"],
                client_user["advertiser_id"],
            ),
        ).fetchall()

        proposals = []

        for row in rows:
            if not row["proposal_json"]:
                continue

            proposals.append(
                json.loads(
                    row["proposal_json"]
                )
            )

        return {
            "status": "ok",
            "clientId": client_user["client_id"],
            "advertiserId": client_user["advertiser_id"],
            "proposals": proposals,
        }

    finally:
        connection.close()


@app.patch("/client-proposals/{proposal_id}")
def update_client_proposal(
    proposal_id: str,
    payload: ClientProposalPatchPayload,
    advertiserId: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=
                    "해당 광고주에 접근할 권한이 없습니다.",
            )

        row = connection.execute(
            """
            SELECT
                advertiser_id,
                proposal_json
            FROM client_proposals
            WHERE id = ?
              AND advertiser_id = ?
            LIMIT 1
            """,
            (
                proposal_id,
                advertiserId,
            ),
        ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail=
                    "광고주 제안을 찾을 수 없습니다.",
            )

        proposal_data = json.loads(
            row["proposal_json"]
        )

        patch_data = payload.model_dump(
            exclude_none=True
        )

        for key, value in patch_data.items():
            proposal_data[key] = value

        status = proposal_data.get(
            "status",
            "preparing",
        )

        assignee = proposal_data.get(
            "assignee"
        )

        due_date = proposal_data.get(
            "dueDate"
        )

        task_status = proposal_data.get(
            "taskStatus",
            "waiting",
        )

        share_token = proposal_data.get(
            "shareToken"
        )

        share_url = proposal_data.get(
            "shareUrl"
        )

        share_status = proposal_data.get(
            "shareStatus",
            "not_shared",
        )

        shared_at = proposal_data.get(
            "sharedAt"
        )

        first_viewed_at = proposal_data.get(
            "firstViewedAt"
        )

        last_viewed_at = proposal_data.get(
            "lastViewedAt"
        )

        view_count = proposal_data.get(
            "viewCount",
            0,
        )

        updated_at = proposal_data.get(
            "updatedAt"
        )

        connection.execute(
            """
            UPDATE client_proposals
            SET
                status = ?,
                assignee = ?,
                due_date = ?,
                task_status = ?,
                share_token = ?,
                share_url = ?,
                share_status = ?,
                shared_at = ?,
                first_viewed_at = ?,
                last_viewed_at = ?,
                view_count = ?,
                updated_at = ?,
                proposal_json = ?
            WHERE id = ?
              AND advertiser_id = ?
            """,
            (
                status,
                assignee,
                due_date,
                task_status,
                share_token,
                share_url,
                share_status,
                shared_at,
                first_viewed_at,
                last_viewed_at,
                view_count,
                updated_at,
                json.dumps(
                    proposal_data,
                    ensure_ascii=False,
                ),
                proposal_id,
                advertiserId,
            ),
        )

        connection.commit()

        return {
            "status": "updated",
            "advertiserId":
                advertiserId,
            "proposal":
                proposal_data,
        }

    finally:
        connection.close()

@app.delete("/client-proposals/{proposal_id}")
def delete_client_proposal(
    proposal_id: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    connection = get_db_connection()

    try:
        existing_proposal = connection.execute(
            """
            SELECT
                id,
                advertiser_id
            FROM client_proposals
            WHERE id = ?
            LIMIT 1
            """,
            (
                proposal_id,
            ),
        ).fetchone()

        if existing_proposal is None:
            return {
                "status": "not_found",
                "message": "광고주 제안을 찾을 수 없습니다.",
            }

        advertiser_id = existing_proposal[
            "advertiser_id"
        ]

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiser_id,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        connection.execute(
            """
            DELETE FROM proposal_messages
            WHERE proposal_id = ?
            """,
            (
                proposal_id,
            ),
        )

        connection.execute(
            """
            DELETE FROM proposal_events
            WHERE proposal_id = ?
            """,
            (
                proposal_id,
            ),
        )

        connection.execute(
            """
            DELETE FROM client_proposals
            WHERE id = ?
            """,
            (
                proposal_id,
            ),
        )

        connection.commit()

        return {
            "status": "deleted",
            "proposalId": proposal_id,
            "advertiserId": advertiser_id,
        }

    finally:
        connection.close()


@app.get("/advertisers")
def get_advertisers(
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload.get(
        "sub"
    )

    connection = get_db_connection()

    try:
        rows = connection.execute(
            """
            SELECT
                id,
                owner_operator_id,
                name,
                company_name,
                status,
                contact_name,
                contact_email,
                contact_phone,
                created_at,
                updated_at
            FROM advertisers
            WHERE owner_operator_id = ?
            ORDER BY name ASC
            """,
            (
                operator_id,
            ),
        ).fetchall()

        advertisers = []

        for row in rows:
            advertisers.append(
                {
                    "id": row["id"],
                    "ownerOperatorId": row["owner_operator_id"],
                    "name": row["name"],
                    "companyName": row["company_name"],
                    "status": row["status"],
                    "contactName": row["contact_name"],
                    "contactEmail": row["contact_email"],
                    "contactPhone": row["contact_phone"],
                    "createdAt": row["created_at"],
                    "updatedAt": row["updated_at"],
                }
            )

        return {
            "status": "ok",
            "advertisers": advertisers,
            "count": len(advertisers),
        }

    finally:
        connection.close()


@app.post("/advertisers")
def create_advertiser(
    payload: AdvertiserCreatePayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    advertiser_name = (
        payload.name.strip()
        if payload.name
        else ""
    )

    if not advertiser_name:
        raise HTTPException(
            status_code=400,
            detail="광고주 이름을 입력해주세요.",
        )

    connection = get_db_connection()

    try:
        existing = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE name = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiser_name,
                operator_id,
            ),
        ).fetchone()

        if existing is not None:
            return {
                "status": "duplicate",
                "message": "동일한 이름의 광고주가 이미 존재합니다.",
                "advertiserId": existing["id"],
            }

        advertiser_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        connection.execute(
            """
            INSERT INTO advertisers (
                id,
                owner_operator_id,
                name,
                company_name,
                status,
                contact_name,
                contact_email,
                contact_phone,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                advertiser_id,
                operator_id,
                advertiser_name,
                (
                    payload.companyName.strip()
                    if payload.companyName
                    else None
                ),
                "active",
                (
                    payload.contactName.strip()
                    if payload.contactName
                    else None
                ),
                (
                    payload.contactEmail.strip()
                    if payload.contactEmail
                    else None
                ),
                (
                    payload.contactPhone.strip()
                    if payload.contactPhone
                    else None
                ),
                now,
                now,
            ),
        )

        connection.commit()

        return {
            "status": "ok",
            "message": "광고주가 생성되었습니다.",
            "advertiser": {
                "id": advertiser_id,
                "ownerOperatorId": operator_id,
                "name": advertiser_name,
                "companyName": payload.companyName,
                "status": "active",
                "contactName": payload.contactName,
                "contactEmail": payload.contactEmail,
                "contactPhone": payload.contactPhone,
                "createdAt": now,
                "updatedAt": now,
            },
        }

    finally:
        connection.close()

@app.patch("/advertisers/{advertiser_id}")
def update_advertiser(
    advertiser_id: str,
    payload: AdvertiserPatchPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    operator_id = token_payload.get("sub")

    if not operator_id:
        return {
            "status": "unauthorized",
            "message": "운영자 정보를 확인할 수 없습니다.",
        }

    connection = get_db_connection()

    try:
        existing = connection.execute(
            """
            SELECT *
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiser_id,
                operator_id,
            ),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=403,
                detail="광고주를 찾을 수 없거나 접근 권한이 없습니다.",
            )

        patch_data = payload.model_dump(
            exclude_none=True
        )

        if not patch_data:
            return {
                "status": "error",
                "message": "수정할 정보가 없습니다.",
            }

        advertiser_name = (
            patch_data["name"].strip()
            if "name" in patch_data
            else existing["name"]
        )

        if not advertiser_name:
            return {
                "status": "error",
                "message": "광고주 이름을 입력해주세요.",
            }

        duplicate = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE name = ?
              AND owner_operator_id = ?
              AND id != ?
            LIMIT 1
            """,
            (
                advertiser_name,
                operator_id,
                advertiser_id,
            ),
        ).fetchone()

        if duplicate is not None:
            return {
                "status": "duplicate",
                "message": "동일한 이름의 광고주가 이미 존재합니다.",
                "advertiserId": duplicate["id"],
            }

        status = (
            patch_data["status"]
            if "status" in patch_data
            else existing["status"]
        )

        if status not in {
            "active",
            "archived",
        }:
            return {
                "status": "error",
                "message": "status는 active 또는 archived여야 합니다.",
            }

        company_name = (
            patch_data["companyName"].strip()
            if "companyName" in patch_data
            and patch_data["companyName"]
            else (
                None
                if "companyName" in patch_data
                else existing["company_name"]
            )
        )

        contact_name = (
            patch_data["contactName"].strip()
            if "contactName" in patch_data
            and patch_data["contactName"]
            else (
                None
                if "contactName" in patch_data
                else existing["contact_name"]
            )
        )

        contact_email = (
            patch_data["contactEmail"].strip()
            if "contactEmail" in patch_data
            and patch_data["contactEmail"]
            else (
                None
                if "contactEmail" in patch_data
                else existing["contact_email"]
            )
        )

        contact_phone = (
            patch_data["contactPhone"].strip()
            if "contactPhone" in patch_data
            and patch_data["contactPhone"]
            else (
                None
                if "contactPhone" in patch_data
                else existing["contact_phone"]
            )
        )

        now = datetime.now().isoformat()

        connection.execute(
            """
            UPDATE advertisers
            SET
                name = ?,
                company_name = ?,
                status = ?,
                contact_name = ?,
                contact_email = ?,
                contact_phone = ?,
                updated_at = ?
            WHERE id = ?
              AND owner_operator_id = ?
            """,
            (
                advertiser_name,
                company_name,
                status,
                contact_name,
                contact_email,
                contact_phone,
                now,
                advertiser_id,
                operator_id,
            ),
        )

        connection.commit()

        return {
            "status": "ok",
            "message": "광고주 정보가 수정되었습니다.",
            "advertiser": {
                "id": advertiser_id,
                "ownerOperatorId": operator_id,
                "name": advertiser_name,
                "companyName": company_name,
                "status": status,
                "contactName": contact_name,
                "contactEmail": contact_email,
                "contactPhone": contact_phone,
                "createdAt": existing["created_at"],
                "updatedAt": now,
            },
        }

    finally:
        connection.close()

@app.delete("/advertisers/{advertiser_id}")
def delete_advertiser(
    advertiser_id: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    operator_id = token_payload.get("sub")

    if not operator_id:
        return {
            "status": "unauthorized",
            "message": "운영자 정보를 확인할 수 없습니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT
                id,
                name
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiser_id,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="광고주를 찾을 수 없거나 접근 권한이 없습니다.",
            )

        # -----------------------------------------
        # 연결 데이터 존재 여부 확인
        # -----------------------------------------

        ad_connection_count = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM ad_connections
            WHERE advertiser_id = ?
            """,
            (
                advertiser_id,
            ),
        ).fetchone()["count"]

        client_user_count = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM client_users
            WHERE advertiser_id = ?
            """,
            (
                advertiser_id,
            ),
        ).fetchone()["count"]

        proposal_count = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM client_proposals
            WHERE advertiser_id = ?
            """,
            (
                advertiser_id,
            ),
        ).fetchone()["count"]

        performance_count = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM ad_performance_daily
            WHERE advertiser_id = ?
            """,
            (
                advertiser_id,
            ),
        ).fetchone()["count"]

        has_related_data = any(
            [
                ad_connection_count > 0,
                client_user_count > 0,
                proposal_count > 0,
                performance_count > 0,
            ]
        )

        if has_related_data:
            return {
                "status": "in_use",
                "message":
                    "연결된 광고 데이터 또는 Client 정보가 있어 삭제할 수 없습니다. 먼저 비활성화해주세요.",
                "relatedData": {
                    "adConnections":
                        ad_connection_count,
                    "clientUsers":
                        client_user_count,
                    "proposals":
                        proposal_count,
                    "performanceRows":
                        performance_count,
                },
            }

        connection.execute(
            """
            DELETE FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            """,
            (
                advertiser_id,
                operator_id,
            ),
        )

        connection.commit()

        return {
            "status": "deleted",
            "advertiserId": advertiser_id,
            "advertiserName": advertiser["name"],
            "message": "광고주가 삭제되었습니다.",
        }

    finally:
        connection.close()


@app.post("/advertisers/{advertiser_id}/ad-connections/assign")
def assign_ad_connection_to_advertiser(
    advertiser_id: str,
    payload: AdvertiserConnectionAssignPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 1. 대상 광고주가 현재 Operator 소유인지 확인
        # -----------------------------------------
        advertiser = connection.execute(
            """
            SELECT
                id,
                name
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiser_id,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=
                    "해당 광고주에 접근할 권한이 없습니다.",
            )

        # -----------------------------------------
        # 2. 광고계정 조회
        #
        # 현재 연결된 광고주가 있다면
        # 그 광고주 ownership도 함께 확인
        # -----------------------------------------
        ad_connection = connection.execute(
            """
            SELECT
                ac.id,
                ac.platform,
                ac.account_id,
                ac.customer_id,
                ac.advertiser_id,
                a.owner_operator_id
                    AS current_owner_operator_id
            FROM ad_connections AS ac
            LEFT JOIN advertisers AS a
                ON a.id = ac.advertiser_id
            WHERE ac.id = ?
            LIMIT 1
            """,
            (
                payload.connectionId,
            ),
        ).fetchone()

        if ad_connection is None:
            return {
                "status": "not_found",
                "message":
                    "광고계정을 찾을 수 없습니다.",
            }

        # -----------------------------------------
        # 3. 다른 Operator의 광고주에 연결된
        #    광고계정을 가져오는 것 차단
        # -----------------------------------------
        current_advertiser_id = (
            ad_connection[
                "advertiser_id"
            ]
        )

        current_owner_operator_id = (
            ad_connection[
                "current_owner_operator_id"
            ]
        )

        if (
            current_advertiser_id
            and
            current_owner_operator_id
            != operator_id
        ):
            raise HTTPException(
                status_code=403,
                detail=
                    "다른 운영자의 광고계정을 재할당할 수 없습니다.",
            )

        now = datetime.now().isoformat()

        # -----------------------------------------
        # 4. 광고계정을 대상 광고주에 연결
        # -----------------------------------------
        connection.execute(
            """
            UPDATE ad_connections
            SET
                advertiser_id = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                advertiser_id,
                now,
                payload.connectionId,
            ),
        )

        performance_account_id = (
            ad_connection["customer_id"]
            or
            ad_connection["account_id"]
        )

        # -----------------------------------------
        # 5. 기존 Performance도 동일 광고주로 연결
        # -----------------------------------------
        if performance_account_id:
            connection.execute(
                """
                UPDATE ad_performance_daily
                SET advertiser_id = ?
                WHERE platform = ?
                  AND account_id = ?
                """,
                (
                    advertiser_id,
                    ad_connection[
                        "platform"
                    ],
                    str(
                        performance_account_id
                    ),
                ),
            )

        connection.commit()

        return {
            "status": "ok",
            "message":
                "광고계정이 광고주에 연결되었습니다.",
            "assignment": {
                "advertiserId":
                    advertiser_id,
                "advertiserName":
                    advertiser["name"],
                "connectionId":
                    ad_connection["id"],
                "platform":
                    ad_connection["platform"],
                "accountId":
                    ad_connection["account_id"],
                "customerId":
                    ad_connection["customer_id"],
            },
        }

    finally:
        connection.close()

@app.get("/ad-connections")
def get_ad_connections(
    advertiserId: str | None = None,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
            "connections": [],
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            return {
                "status": "forbidden",
                "message": "해당 광고주에 접근할 권한이 없습니다.",
                "advertiserId": advertiserId,
                "connections": [],
            }

        rows = connection.execute(
            """
            SELECT *
            FROM ad_connections
            WHERE advertiser_id = ?
            ORDER BY created_at ASC
            """,
            (
                advertiserId,
            ),
        ).fetchall()

        connections = [
            {
                "id": row["id"],
                "advertiserId": row["advertiser_id"],
                "platform": row["platform"],
                "apiUrl": row["api_url"],
                "accountId": row["account_id"],
                "accountName": row["account_name"],
                "status": row["status"],
                "tokenExpiresAt": row["token_expires_at"],
                "lastSyncedAt": row["last_synced_at"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
            for row in rows
        ]

        return {
            "status": "ok",
            "advertiserId": advertiserId,
            "connections": connections,
        }

    finally:
        connection.close()


# LEGACY:
# 기존 /stats + ad_performance 기반 성과 조회 API.
# 현재 운영 성과 데이터는
# /ad-performance/daily +
# ad_performance_daily를 사용한다.
# 프론트 참조 여부 확인 후 제거 예정.
@app.get("/ad-performance")
def get_ad_performance(
    advertiserId: str,
    platform: str | None = None,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
            "performance": [],
            "count": 0,
        }

    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 1. Advertiser ownership 검증
        # -----------------------------------------
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            return {
                "status": "forbidden",
                "advertiserId": advertiserId,
                "message": "해당 광고주에 접근할 권한이 없습니다.",
                "performance": [],
                "count": 0,
            }

        # -----------------------------------------
        # 2. 해당 광고주에 연결된 계정의
        #    legacy performance만 조회
        # -----------------------------------------
        if platform:
            rows = connection.execute(
                """
                SELECT ap.*
                FROM ad_performance AS ap
                WHERE ap.platform = ?
                  AND EXISTS (
                      SELECT 1
                      FROM ad_connections AS ac
                      WHERE ac.advertiser_id = ?
                        AND ac.platform = ap.platform
                        AND (
                            CAST(ac.account_id AS TEXT)
                                = CAST(ap.account_id AS TEXT)
                            OR
                            CAST(ac.customer_id AS TEXT)
                                = CAST(ap.account_id AS TEXT)
                        )
                  )
                ORDER BY ap.synced_at DESC
                """,
                (
                    platform,
                    advertiserId,
                ),
            ).fetchall()

        else:
            rows = connection.execute(
                """
                SELECT ap.*
                FROM ad_performance AS ap
                WHERE EXISTS (
                    SELECT 1
                    FROM ad_connections AS ac
                    WHERE ac.advertiser_id = ?
                      AND ac.platform = ap.platform
                      AND (
                          CAST(ac.account_id AS TEXT)
                              = CAST(ap.account_id AS TEXT)
                          OR
                          CAST(ac.customer_id AS TEXT)
                              = CAST(ap.account_id AS TEXT)
                      )
                )
                ORDER BY ap.synced_at DESC
                """,
                (
                    advertiserId,
                ),
            ).fetchall()

        performance = [
            {
                "id": row["id"],
                "platform": row["platform"],
                "accountId": row["account_id"],
                "datePreset": row["date_preset"],
                "campaignId": row["campaign_id"],
                "campaign": row["campaign_name"],
                "channel": row["channel"],
                "spend": row["spend"],
                "impressions": row["impressions"],
                "clicks": row["clicks"],
                "conversions": row["conversions"],
                "revenue": row["revenue"],
                "ctr": row["ctr"],
                "cpc": row["cpc"],
                "cvr": row["cvr"],
                "cpa": row["cpa"],
                "roas": row["roas"],
                "syncedAt": row["synced_at"],
            }
            for row in rows
        ]

        return {
            "status": "ok",
            "advertiserId": advertiserId,
            "platform": platform,
            "count": len(performance),
            "performance": performance,
        }

    finally:
        connection.close()


@app.get("/ad-performance/daily")
def get_daily_ad_performance(
    advertiserId: str,
    platform: str | None = None,
    accountId: str | None = None,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
            "performance": [],
            "count": 0,
        }

    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 2. advertiser ownership 검증
        # -----------------------------------------

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            return {
                "status": "forbidden",
                "message": "해당 광고주에 접근할 권한이 없습니다.",
                "advertiserId": advertiserId,
                "performance": [],
                "count": 0,
            }

        # -----------------------------------------
        # 3. 성과 데이터 조회
        # -----------------------------------------

        if accountId:
            rows = connection.execute(
                """
                SELECT *
                FROM ad_performance_daily
                WHERE platform = ?
                  AND advertiser_id = ?
                  AND account_id = ?
                ORDER BY
                    date ASC,
                    campaign_name ASC
                """,
                (
                    platform,
                    advertiserId,
                    accountId,
                ),
            ).fetchall()

        else:
            rows = connection.execute(
                """
                SELECT *
                FROM ad_performance_daily
                WHERE platform = ?
                  AND advertiser_id = ?
                ORDER BY
                    date ASC,
                    campaign_name ASC
                """,
                (
                    platform,
                    advertiserId,
                ),
            ).fetchall()

        performance = []

        for row in rows:
            performance.append(
                {
                    "id": row["id"],
                    "advertiserId": row["advertiser_id"],
                    "platform": row["platform"],
                    "accountId": row["account_id"],
                    "date": row["date"],
                    "campaignId": row["campaign_id"],
                    "campaign": row["campaign_name"],
                    "channel": row["channel"],
                    "spend": row["spend"],
                    "impressions": row["impressions"],
                    "clicks": row["clicks"],
                    "conversions": row["conversions"],
                    "revenue": row["revenue"],
                    "ctr": row["ctr"],
                    "cpc": row["cpc"],
                    "cvr": row["cvr"],
                    "cpa": row["cpa"],
                    "roas": row["roas"],
                    "syncedAt": row["synced_at"],
                }
            )

        return {
            "status": "ok",
            "platform": platform,
            "advertiserId": advertiserId,
            "accountId": accountId,
            "count": len(performance),
            "performance": performance,
        }

    finally:
        connection.close()

# ==================================================
# Metric Anomaly Alerts
# ==================================================


class AnomalyAlertRunPayload(BaseModel):
    advertiserId: str
    targetDate: str | None = None


class AnomalyAlertPatchPayload(BaseModel):
    status: str


def _verify_alert_advertiser_access(
    advertiser_id: str,
    operator_id: str,
):
    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiser_id,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "해당 광고주에 접근할 "
                    "권한이 없습니다."
                ),
            )

    finally:
        connection.close()


# --------------------------------------------------
# 1. 이상 탐지 실행
# --------------------------------------------------

@app.post("/anomaly-alerts/run")
def run_metric_anomaly_alerts(
    payload: AnomalyAlertRunPayload,
    token_payload=Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        raise HTTPException(
            status_code=400,
            detail=(
                "advertiserId가 필요합니다."
            ),
        )

    _verify_alert_advertiser_access(
        payload.advertiserId,
        operator_id,
    )

    try:
        result = run_anomaly_detection(
            advertiser_id=
                payload.advertiserId,

            target_date=
                payload.targetDate,
        )

        return result

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(
                error
            ),
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "이상 탐지 실행 중 오류가 "
                f"발생했습니다: {error}"
            ),
        )


# --------------------------------------------------
# 2. Alert 목록
# --------------------------------------------------

@app.get("/anomaly-alerts")
def get_metric_anomaly_alerts(
    advertiserId: str,

    status: str | None = None,
    severity: str | None = None,
    scope: str | None = None,

    limit: int = 100,

    token_payload=Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        raise HTTPException(
            status_code=400,
            detail=(
                "advertiserId가 필요합니다."
            ),
        )

    _verify_alert_advertiser_access(
        advertiserId,
        operator_id,
    )

    limit = max(
        1,
        min(
            int(limit),
            500,
        ),
    )

    query = """
        SELECT
            id,
            advertiser_id,

            scope,
            entity_key,

            platform,
            channel,

            campaign_id,
            campaign_name,

            metric,
            alert_date,

            current_value,
            baseline_value,

            change_pct,
            robust_z,

            severity,
            direction,

            reason_code,
            status,

            title,
            message,

            created_at,
            updated_at,

            acknowledged_at,
            resolved_at

        FROM metric_anomaly_alerts

        WHERE advertiser_id = ?
    """

    params = [
        advertiserId
    ]

    if status:
        query += """
            AND status = ?
        """

        params.append(
            status
        )

    if severity:
        query += """
            AND severity = ?
        """

        params.append(
            severity
        )

    if scope:
        query += """
            AND scope = ?
        """

        params.append(
            scope
        )

    query += """
        ORDER BY
            CASE severity
                WHEN 'critical'
                    THEN 1
                WHEN 'warning'
                    THEN 2
                ELSE 3
            END ASC,

            alert_date DESC,
            created_at DESC

        LIMIT ?
    """

    params.append(
        limit
    )

    connection = (
        get_db_connection()
    )

    try:
        rows = connection.execute(
            query,
            tuple(
                params
            ),
        ).fetchall()

        alerts = []

        for row in rows:
            alerts.append(
                {
                    "id":
                        row[
                            "id"
                        ],

                    "advertiserId":
                        row[
                            "advertiser_id"
                        ],

                    "scope":
                        row[
                            "scope"
                        ],

                    "entityKey":
                        row[
                            "entity_key"
                        ],

                    "platform":
                        row[
                            "platform"
                        ],

                    "channel":
                        row[
                            "channel"
                        ],

                    "campaignId":
                        row[
                            "campaign_id"
                        ],

                    "campaignName":
                        row[
                            "campaign_name"
                        ],

                    "metric":
                        row[
                            "metric"
                        ],

                    "alertDate":
                        row[
                            "alert_date"
                        ],

                    "currentValue":
                        row[
                            "current_value"
                        ],

                    "baselineValue":
                        row[
                            "baseline_value"
                        ],

                    "changePct":
                        row[
                            "change_pct"
                        ],

                    "robustZ":
                        row[
                            "robust_z"
                        ],

                    "severity":
                        row[
                            "severity"
                        ],

                    "direction":
                        row[
                            "direction"
                        ],

                    "reasonCode":
                        row[
                            "reason_code"
                        ],

                    "status":
                        row[
                            "status"
                        ],

                    "title":
                        row[
                            "title"
                        ],

                    "message":
                        row[
                            "message"
                        ],

                    "createdAt":
                        row[
                            "created_at"
                        ],

                    "updatedAt":
                        row[
                            "updated_at"
                        ],

                    "acknowledgedAt":
                        row[
                            "acknowledged_at"
                        ],

                    "resolvedAt":
                        row[
                            "resolved_at"
                        ],
                }
            )

        return {
            "status":
                "ok",

            "advertiserId":
                advertiserId,

            "count":
                len(
                    alerts
                ),

            "alerts":
                alerts,
        }

    finally:
        connection.close()


# --------------------------------------------------
# 3. Alert Summary
# --------------------------------------------------

@app.get("/anomaly-alerts/summary")
def get_metric_anomaly_alert_summary(
    advertiserId: str,

    token_payload=Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        raise HTTPException(
            status_code=400,
            detail=(
                "advertiserId가 필요합니다."
            ),
        )

    _verify_alert_advertiser_access(
        advertiserId,
        operator_id,
    )

    connection = (
        get_db_connection()
    )

    try:
        total_row = (
            connection.execute(
                """
                SELECT
                    COUNT(*) AS total,

                    SUM(
                        CASE
                            WHEN status = 'open'
                            THEN 1
                            ELSE 0
                        END
                    ) AS open_count,

                    SUM(
                        CASE
                            WHEN status = 'acknowledged'
                            THEN 1
                            ELSE 0
                        END
                    ) AS acknowledged_count,

                    SUM(
                        CASE
                            WHEN status = 'resolved'
                            THEN 1
                            ELSE 0
                        END
                    ) AS resolved_count,

                    SUM(
                        CASE
                            WHEN status = 'open'
                             AND severity = 'critical'
                            THEN 1
                            ELSE 0
                        END
                    ) AS critical_count,

                    SUM(
                        CASE
                            WHEN status = 'open'
                             AND severity = 'warning'
                            THEN 1
                            ELSE 0
                        END
                    ) AS warning_count

                FROM metric_anomaly_alerts

                WHERE advertiser_id = ?
                """,
                (
                    advertiserId,
                ),
            ).fetchone()
        )

        return {
            "status":
                "ok",

            "advertiserId":
                advertiserId,

            "total":
                int(
                    total_row[
                        "total"
                    ]
                    or 0
                ),

            "open":
                int(
                    total_row[
                        "open_count"
                    ]
                    or 0
                ),

            "acknowledged":
                int(
                    total_row[
                        "acknowledged_count"
                    ]
                    or 0
                ),

            "resolved":
                int(
                    total_row[
                        "resolved_count"
                    ]
                    or 0
                ),

            "critical":
                int(
                    total_row[
                        "critical_count"
                    ]
                    or 0
                ),

            "warning":
                int(
                    total_row[
                        "warning_count"
                    ]
                    or 0
                ),
        }

    finally:
        connection.close()


# --------------------------------------------------
# 4. Alert 상태 변경
# --------------------------------------------------

@app.patch(
    "/anomaly-alerts/{alert_id}"
)
def update_metric_anomaly_alert(
    alert_id: str,
    payload: AnomalyAlertPatchPayload,

    token_payload=Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    allowed_statuses = {
        "open",
        "acknowledged",
        "resolved",
    }

    next_status = str(
        payload.status
        or ""
    ).strip().lower()

    if (
        next_status
        not in allowed_statuses
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "status는 open, "
                "acknowledged, resolved "
                "중 하나여야 합니다."
            ),
        )

    connection = (
        get_db_connection()
    )

    try:
        alert = connection.execute(
            """
            SELECT
                a.id,
                a.advertiser_id

            FROM metric_anomaly_alerts
                AS a

            INNER JOIN advertisers
                AS adv
                ON adv.id =
                    a.advertiser_id

            WHERE a.id = ?
              AND adv.owner_operator_id = ?

            LIMIT 1
            """,
            (
                alert_id,
                operator_id,
            ),
        ).fetchone()

        if alert is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Alert를 찾을 수 없거나 "
                    "접근 권한이 없습니다."
                ),
            )

        now = (
            datetime.now()
            .isoformat()
        )

        if (
            next_status
            == "open"
        ):
            acknowledged_at = None
            resolved_at = None

        elif (
            next_status
            == "acknowledged"
        ):
            acknowledged_at = now
            resolved_at = None

        else:
            acknowledged_at = now
            resolved_at = now

        connection.execute(
            """
            UPDATE
                metric_anomaly_alerts

            SET
                status = ?,
                acknowledged_at = ?,
                resolved_at = ?,
                updated_at = ?

            WHERE id = ?
            """,
            (
                next_status,
                acknowledged_at,
                resolved_at,
                now,
                alert_id,
            ),
        )

        connection.commit()

        return {
            "status":
                "ok",

            "alertId":
                alert_id,

            "alertStatus":
                next_status,

            "acknowledgedAt":
                acknowledged_at,

            "resolvedAt":
                resolved_at,
        }

    finally:
        connection.close()

@app.get("/client-portal/performance")
def get_client_portal_performance(
    platform: str = "naver",
    accountId: str | None = None,
    token_payload = Depends(
        require_client
    ),
):
    client_id = token_payload[
        "clientId"
    ]

    user_id = token_payload[
        "sub"
    ]

    connection = get_db_connection()

    try:
        client_row = connection.execute(
            """
            SELECT
                id,
                client_id,
                advertiser_id
            FROM client_users
            WHERE id = ?
              AND client_id = ?
            LIMIT 1
            """,
            (
                user_id,
                client_id,
            ),
        ).fetchone()

        if client_row is None:
            return {
                "status": "not_found",
                "clientId": client_id,
                "message": "클라이언트 정보를 찾을 수 없습니다.",
                "performance": [],
                "count": 0,
            }

        advertiser_id = client_row[
            "advertiser_id"
        ]

        if not advertiser_id:
            return {
                "status": "error",
                "clientId": client_id,
                "message": "클라이언트에 연결된 광고주가 없습니다.",
                "performance": [],
                "count": 0,
            }

        if accountId:
            rows = connection.execute(
                """
                SELECT *
                FROM ad_performance_daily
                WHERE platform = ?
                  AND advertiser_id = ?
                  AND account_id = ?
                ORDER BY
                    date ASC,
                    campaign_name ASC
                """,
                (
                    platform,
                    advertiser_id,
                    accountId,
                ),
            ).fetchall()

        else:
            rows = connection.execute(
                """
                SELECT *
                FROM ad_performance_daily
                WHERE platform = ?
                  AND advertiser_id = ?
                ORDER BY
                    date ASC,
                    campaign_name ASC
                """,
                (
                    platform,
                    advertiser_id,
                ),
            ).fetchall()

        performance = []

        for row in rows:
            performance.append(
                {
                    "id":
                        row["id"],
                    "advertiserId":
                        row["advertiser_id"],
                    "platform":
                        row["platform"],
                    "accountId":
                        row["account_id"],
                    "date":
                        row["date"],
                    "campaignId":
                        row["campaign_id"],
                    "campaign":
                        row["campaign_name"],
                    "channel":
                        row["channel"],
                    "spend":
                        row["spend"],
                    "impressions":
                        row["impressions"],
                    "clicks":
                        row["clicks"],
                    "conversions":
                        row["conversions"],
                    "revenue":
                        row["revenue"],
                    "ctr":
                        row["ctr"],
                    "cpc":
                        row["cpc"],
                    "cvr":
                        row["cvr"],
                    "cpa":
                        row["cpa"],
                    "roas":
                        row["roas"],
                    "syncedAt":
                        row["synced_at"],
                }
            )

        return {
            "status": "ok",
            "clientId":
                client_id,
            "advertiserId":
                advertiser_id,
            "platform":
                platform,
            "accountId":
                accountId,
            "count":
                len(performance),
            "performance":
                performance,
        }

    finally:
        connection.close()


@app.post("/ad-connections/naver/test")
def test_naver_connection(
    payload: NaverConnectionTestPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    api_base_url = "https://api.searchad.naver.com"

    uri = "/ncc/campaigns"
    method = "GET"

    timestamp = str(int(time.time() * 1000))

    signature = create_naver_signature(
        timestamp=timestamp,
        method=method,
        uri=uri,
        secret_key=payload.secretKey,
    )

    headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Timestamp": timestamp,
        "X-API-KEY": payload.accessLicense,
        "X-Customer": str(payload.customerId),
        "X-Signature": signature,
    }

    try:
        response = requests.get(
            f"{api_base_url}{uri}",
            headers=headers,
            timeout=15,
        )

        if response.status_code == 200:
            campaigns = response.json()

            return {
                "status": "connected",
                "message": "네이버 검색광고 API 연결에 성공했습니다.",
                "campaignCount": (
                    len(campaigns)
                    if isinstance(
                        campaigns,
                        list,
                    )
                    else None
                ),
            }

        return {
            "status": "failed",
            "message": "네이버 검색광고 API 인증에 실패했습니다.",
            "httpStatus": response.status_code,
            "detail": response.text[:500],
        }

    except requests.RequestException as error:
        return {
            "status": "error",
            "message": "네이버 검색광고 API 서버에 연결하지 못했습니다.",
            "detail": str(error),
        }


@app.post("/ad-connections/naver/sync-campaigns")
def sync_naver_campaigns(
    advertiserId: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        row = connection.execute(
            """
            SELECT
                id,
                advertiser_id,
                access_token,
                secret_key,
                customer_id,
                status
            FROM ad_connections
            WHERE platform = ?
              AND advertiser_id = ?
              AND status = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                advertiserId,
                "connected",
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_connected",
                "advertiserId": advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        access_license = row["access_token"]

        secret_key = row["secret_key"]

        customer_id = row["customer_id"]

        if not access_license or not secret_key or not customer_id:
            return {
                "status": "credentials_missing",
                "advertiserId": advertiserId,
                "message": "Naver Ads 인증정보가 완전하지 않습니다.",
            }

        api_base_url = "https://api.searchad.naver.com"

        uri = "/ncc/campaigns"
        method = "GET"

        timestamp = str(int(time.time() * 1000))

        signature = create_naver_signature(
            timestamp=timestamp,
            method=method,
            uri=uri,
            secret_key=secret_key,
        )

        headers = {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Timestamp": timestamp,
            "X-API-KEY": access_license,
            "X-Customer": str(customer_id),
            "X-Signature": signature,
        }

        response = requests.get(
            f"{api_base_url}{uri}",
            headers=headers,
            timeout=15,
        )

        if response.status_code != 200:
            return {
                "status": "failed",
                "advertiserId": advertiserId,
                "message": "Naver 캠페인 조회에 실패했습니다.",
                "httpStatus": response.status_code,
                "detail": response.text[:500],
            }

        raw_campaigns = response.json()

        campaigns = []

        if isinstance(
            raw_campaigns,
            list,
        ):
            for campaign in raw_campaigns:
                campaigns.append(
                    {
                        "id": campaign.get("nccCampaignId"),
                        "name": campaign.get("name"),
                        "campaignType": campaign.get("campaignTp"),
                        "status": campaign.get("status"),
                        "deliveryMethod": campaign.get("deliveryMethod"),

                        "dailyBudget": campaign.get("dailyBudget"),

                        "useDailyBudget": campaign.get(
                            "useDailyBudget"
                        ),

                        "sharedBudgetId": campaign.get(
                            "sharedBudgetId"
                        ),

                        "userLock": campaign.get(
                            "userLock"
                        ),

                        "usePeriod": campaign.get("usePeriod"),
                        "periodStartDt": campaign.get("periodStartDt"),
                        "periodEndDt": campaign.get("periodEndDt"),
                    }
                )

        # -----------------------------------------
        # Naver 실제 설정 일예산을
        # Campaign Budget Policy에 snapshot 저장
        #
        # PDF 정의:
        # x0_i = current_daily_budget
        #
        # 중요:
        # 기존 planner가 설정한
        # min_daily_budget / max_daily_budget은
        # 여기서 절대 덮어쓰지 않는다.
        # -----------------------------------------

        budget_synced_at = (
            datetime.utcnow()
            .isoformat()
            + "Z"
        )

        policy_account_id = str(
            customer_id
        )

        for campaign in campaigns:
            campaign_id = str(
                campaign.get(
                    "id"
                )
                or ""
            ).strip()

            if not campaign_id:
                continue

            daily_budget_raw = (
                campaign.get(
                    "dailyBudget"
                )
            )

            current_daily_budget = None

            if daily_budget_raw not in (
                None,
                "",
            ):
                try:
                    current_daily_budget = float(
                        daily_budget_raw
                    )

                except (
                    TypeError,
                    ValueError,
                ):
                    current_daily_budget = None

            use_daily_budget_raw = (
                campaign.get(
                    "useDailyBudget"
                )
            )

            use_daily_budget = (
                None
                if use_daily_budget_raw
                is None
                else (
                    1
                    if bool(
                        use_daily_budget_raw
                    )
                    else 0
                )
            )

            shared_budget_id_raw = (
                campaign.get(
                    "sharedBudgetId"
                )
            )

            shared_budget_id = (
                str(
                    shared_budget_id_raw
                ).strip()
                if shared_budget_id_raw
                not in (
                    None,
                    "",
                )
                else None
            )

            campaign_status_raw = (
                campaign.get(
                    "status"
                )
            )

            campaign_status = (
                str(
                    campaign_status_raw
                ).strip()
                if campaign_status_raw
                not in (
                    None,
                    "",
                )
                else None
            )

            user_lock_raw = (
                campaign.get(
                    "userLock"
                )
            )

            user_lock = (
                None
                if user_lock_raw is None
                else (
                    1
                    if bool(
                        user_lock_raw
                    )
                    else 0
                )
            ) 

            policy_id = (
                f"naver-"
                f"{advertiserId}-"
                f"{policy_account_id}-"
                f"{campaign_id}"
            )

            connection.execute(
                """
                INSERT INTO
                    ad_campaign_budget_policies (
                        id,
                        advertiser_id,
                        platform,
                        account_id,
                        campaign_id,
                        campaign_name,

                        current_daily_budget,
                        use_daily_budget,
                        shared_budget_id,
                        campaign_status,
                        user_lock,

                        current_budget_source,
                        current_budget_synced_at,
                        created_at,
                        updated_at
                    )
                VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?
                )

                ON CONFLICT(
                    advertiser_id,
                    platform,
                    account_id,
                    campaign_id
                )
                DO UPDATE SET
                    campaign_name =
                        excluded.campaign_name,

                    current_daily_budget =
                        excluded.current_daily_budget,

                    use_daily_budget =
                        excluded.use_daily_budget,

                    shared_budget_id =
                        excluded.shared_budget_id,

                    campaign_status =
                        excluded.campaign_status,

                    user_lock =
                        excluded.user_lock,

                    current_budget_source =
                        excluded.current_budget_source,

                    current_budget_synced_at =
                        excluded.current_budget_synced_at,

                    updated_at =
                        excluded.updated_at
                """,
                (
                    policy_id,
                    advertiserId,
                    "naver",
                    policy_account_id,
                    campaign_id,
                    campaign.get(
                        "name"
                    ),

                    current_daily_budget,
                    use_daily_budget,
                    shared_budget_id,
                    campaign_status,
                    user_lock,

                    "platform_api",
                    budget_synced_at,
                    budget_synced_at,
                    budget_synced_at,
                ),
            )

        connection.commit()       

        return {
            "status": "ok",
            "advertiserId": advertiserId,
            "connectionId": row["id"],
            "customerId": customer_id,
            "campaignCount": len(campaigns),
            "campaigns": campaigns,
        }

    except requests.RequestException as error:
        return {
            "status": "error",
            "advertiserId": advertiserId,
            "message": "Naver 광고 API 서버에 연결하지 못했습니다.",
            "detail": str(error),
        }

    finally:
        connection.close()




@app.get(
    "/optimization/campaign-budget-policies"
)
def get_campaign_budget_policies(
    advertiserId: str,
    token_payload=Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 1. Advertiser ownership
        # -----------------------------------------

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "해당 광고주에 접근할 "
                    "권한이 없습니다."
                ),
            )

        # -----------------------------------------
        # 2. Connected Naver account
        # -----------------------------------------

        account_row = connection.execute(
            """
            SELECT
                account_id,
                customer_id
            FROM ad_connections
            WHERE advertiser_id = ?
              AND platform = ?
              AND status = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                advertiserId,
                "naver",
                "connected",
            ),
        ).fetchone()

        if account_row is None:
            return {
                "status": "not_connected",
                "advertiserId": advertiserId,
                "message": (
                    "선택한 광고주에 연결된 "
                    "Naver Ads 계정이 없습니다."
                ),
                "policies": [],
            }

        account_id = str(
            account_row["customer_id"]
            or account_row["account_id"]
            or ""
        )

        if not account_id:
            return {
                "status": "account_missing",
                "advertiserId": advertiserId,
                "message": (
                    "Naver Ads 계정 식별값을 "
                    "확인할 수 없습니다."
                ),
                "policies": [],
            }

        # -----------------------------------------
        # 3. Campaign Budget Policy 조회
        # -----------------------------------------

        rows = connection.execute(
            """
            SELECT
                campaign_id,
                campaign_name,

                current_daily_budget,
                use_daily_budget,
                shared_budget_id,
                campaign_status,
                user_lock,

                min_daily_budget,
                max_daily_budget,

                current_budget_source,
                policy_source,
                current_budget_synced_at,
                updated_at

            FROM ad_campaign_budget_policies

            WHERE advertiser_id = ?
              AND platform = ?
              AND account_id = ?

            ORDER BY
                campaign_name ASC,
                campaign_id ASC
            """,
            (
                advertiserId,
                "naver",
                account_id,
            ),
        ).fetchall()

        # -----------------------------------------
        # 4. Summary 초기값
        # -----------------------------------------

        policies = []

        total_current_budget = 0.0

        optimization_current_total_budget = 0.0

        policy_ready_count = 0

        optimization_eligible_count = 0

        excluded_campaign_count = 0

        # -----------------------------------------
        # 5. Campaign별 eligibility / policy
        # -----------------------------------------

        for row in rows:
            current_budget = (
                row[
                    "current_daily_budget"
                ]
            )

            min_budget = (
                row[
                    "min_daily_budget"
                ]
            )

            max_budget = (
                row[
                    "max_daily_budget"
                ]
            )

            use_daily_budget = (
                row[
                    "use_daily_budget"
                ]
            )

            shared_budget_id = (
                row[
                    "shared_budget_id"
                ]
            )

            campaign_status = str(
                row[
                    "campaign_status"
                ]
                or ""
            ).strip()

            user_lock = (
                row[
                    "user_lock"
                ]
            )

            # 전체 26개 캠페인의
            # Naver dailyBudget 합계
            if current_budget is not None:
                total_current_budget += float(
                    current_budget
                )

            # -------------------------------------
            # Optimization eligibility
            # -------------------------------------

            optimization_eligible = True

            eligibility_reason = (
                "OPTIMIZATION_ELIGIBLE"
            )

            if (
                campaign_status
                != "ELIGIBLE"
                or int(
                    user_lock or 0
                ) == 1
            ):
                optimization_eligible = False

                eligibility_reason = (
                    "STATUS_OR_LOCK"
                )

            elif shared_budget_id:
                optimization_eligible = False

                eligibility_reason = (
                    "SHARED_BUDGET"
                )

            elif int(
                use_daily_budget or 0
            ) != 1:
                optimization_eligible = False

                eligibility_reason = (
                    "DAILY_BUDGET_DISABLED"
                )

            elif (
                current_budget is None
                or float(
                    current_budget
                ) <= 0
            ):
                optimization_eligible = False

                eligibility_reason = (
                    "NO_VALID_CURRENT_BUDGET"
                )

            # -------------------------------------
            # Eligible portfolio summary
            # -------------------------------------

            if optimization_eligible:
                optimization_eligible_count += 1

                optimization_current_total_budget += float(
                    current_budget
                )

            else:
                excluded_campaign_count += 1

            # -------------------------------------
            # L / U Policy readiness
            # -------------------------------------

            policy_ready = (
                optimization_eligible
                and current_budget is not None
                and min_budget is not None
                and max_budget is not None
            )

            if policy_ready:
                policy_ready_count += 1

            # -------------------------------------
            # Response
            # -------------------------------------

            policies.append(
                {
                    "campaignId":
                        row[
                            "campaign_id"
                        ],

                    "campaignName":
                        row[
                            "campaign_name"
                        ],

                    "currentDailyBudget":
                        current_budget,

                    "minDailyBudget":
                        min_budget,

                    "maxDailyBudget":
                        max_budget,

                    "useDailyBudget":
                        (
                            None
                            if use_daily_budget
                            is None
                            else bool(
                                use_daily_budget
                            )
                        ),

                    "sharedBudgetId":
                        shared_budget_id,

                    "campaignStatus":
                        campaign_status,

                    "userLock":
                        (
                            None
                            if user_lock
                            is None
                            else bool(
                                user_lock
                            )
                        ),

                    "optimizationEligible":
                        optimization_eligible,

                    "eligibilityReason":
                        eligibility_reason,

                    "currentBudgetSource":
                        row[
                            "current_budget_source"
                        ],

                    "policySource":
                        row[
                            "policy_source"
                        ],

                    "currentBudgetSyncedAt":
                        row[
                            "current_budget_synced_at"
                        ],

                    "updatedAt":
                        row[
                            "updated_at"
                        ],

                    "policyReady":
                        policy_ready,
                }
            )

        # -----------------------------------------
        # 6. Portfolio response
        # -----------------------------------------

        return {
            "status": "ok",

            "advertiserId":
                advertiserId,

            "platform":
                "naver",

            "accountId":
                account_id,

            "campaignCount":
                len(policies),

            "optimizationEligibleCount":
                optimization_eligible_count,

            "excludedCampaignCount":
                excluded_campaign_count,

            "policyReadyCount":
                policy_ready_count,

            "missingPolicyCount":
                (
                    optimization_eligible_count
                    - policy_ready_count
                ),

            "currentTotalDailyBudget":
                total_current_budget,

            "optimizationCurrentTotalDailyBudget":
                optimization_current_total_budget,

            "policies":
                policies,
        }

    finally:
        connection.close()

@app.post(
    "/optimization/campaign-budget-policies"
)
def save_campaign_budget_policies(
    payload: CampaignBudgetPolicyUpdatePayload,
    token_payload=Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        raise HTTPException(
            status_code=400,
            detail=(
                "advertiserId가 필요합니다."
            ),
        )

    if not payload.policies:
        raise HTTPException(
            status_code=400,
            detail=(
                "저장할 Budget Policy가 없습니다."
            ),
        )

    # -----------------------------------------
    # 중복 campaignId 방지
    # -----------------------------------------

    campaign_ids = [
        str(
            item.campaignId
        ).strip()
        for item in payload.policies
    ]

    if len(
        campaign_ids
    ) != len(
        set(
            campaign_ids
        )
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "중복된 campaignId가 있습니다."
            ),
        )

    connection = get_db_connection()

    try:
        # -------------------------------------
        # 1. Advertiser ownership
        # -------------------------------------

        advertiser = (
            connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    payload.advertiserId,
                    operator_id,
                ),
            ).fetchone()
        )

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "해당 광고주에 접근할 "
                    "권한이 없습니다."
                ),
            )

        # -------------------------------------
        # 2. Connected Naver account
        # -------------------------------------

        account_row = (
            connection.execute(
                """
                SELECT
                    account_id,
                    customer_id
                FROM ad_connections
                WHERE advertiser_id = ?
                  AND platform = ?
                  AND status = ?
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (
                    payload.advertiserId,
                    "naver",
                    "connected",
                ),
            ).fetchone()
        )

        if account_row is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "선택한 광고주에 연결된 "
                    "Naver Ads 계정이 없습니다."
                ),
            )

        account_id = str(
            account_row[
                "customer_id"
            ]
            or account_row[
                "account_id"
            ]
            or ""
        )

        if not account_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Naver Ads 계정 식별값을 "
                    "확인할 수 없습니다."
                ),
            )

        saved_count = 0

        # -------------------------------------
        # 3. Campaign별 검증 후 저장
        # -------------------------------------

        for item in payload.policies:
            campaign_id = str(
                item.campaignId
            ).strip()

            min_budget = float(
                item.minDailyBudget
            )

            max_budget = float(
                item.maxDailyBudget
            )

            if (
                not math.isfinite(
                    min_budget
                )
                or not math.isfinite(
                    max_budget
                )
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{campaign_id}: "
                        "예산은 유효한 숫자여야 합니다."
                    ),
                )

            if min_budget < 0:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{campaign_id}: "
                        "최소 예산은 0원 이상이어야 합니다."
                    ),
                )

            if (
                max_budget
                < min_budget
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{campaign_id}: "
                        "최대 예산은 최소 예산보다 "
                        "작을 수 없습니다."
                    ),
                )

            row = (
                connection.execute(
                    """
                    SELECT
                        campaign_id,
                        campaign_name,
                        current_daily_budget,
                        use_daily_budget,
                        shared_budget_id,
                        campaign_status,
                        user_lock
                    FROM
                        ad_campaign_budget_policies
                    WHERE advertiser_id = ?
                      AND platform = ?
                      AND account_id = ?
                      AND campaign_id = ?
                    LIMIT 1
                    """,
                    (
                        payload.advertiserId,
                        "naver",
                        account_id,
                        campaign_id,
                    ),
                ).fetchone()
            )

            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"{campaign_id}: "
                        "Campaign Budget Policy "
                        "대상을 찾을 수 없습니다."
                    ),
                )

            current_budget = (
                row[
                    "current_daily_budget"
                ]
            )

            use_daily_budget = (
                row[
                    "use_daily_budget"
                ]
            )

            shared_budget_id = (
                row[
                    "shared_budget_id"
                ]
            )

            campaign_status = str(
                row[
                    "campaign_status"
                ]
                or ""
            ).strip()

            user_lock = (
                row[
                    "user_lock"
                ]
            )

            # ---------------------------------
            # Optimization eligibility
            # ---------------------------------

            optimization_eligible = (
                campaign_status
                == "ELIGIBLE"
                and int(
                    user_lock or 0
                ) == 0
                and not shared_budget_id
                and int(
                    use_daily_budget or 0
                ) == 1
                and current_budget
                is not None
                and float(
                    current_budget
                ) > 0
            )

            if not optimization_eligible:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{campaign_id}: "
                        "현재 Budget Optimization "
                        "대상 캠페인이 아닙니다."
                    ),
                )

            current_budget = float(
                current_budget
            )

            if not (
                min_budget
                <= current_budget
                <= max_budget
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{campaign_id}: "
                        "현재 Naver 일예산이 "
                        "최소·최대 예산 범위 안에 "
                        "있어야 합니다."
                    ),
                )

            # ---------------------------------
            # L / U만 업데이트
            #
            # current_daily_budget는
            # Naver sync 값이므로 여기서
            # 절대 수정하지 않는다.
            # ---------------------------------

            connection.execute(
                """
                UPDATE
                    ad_campaign_budget_policies

                SET
                    min_daily_budget = ?,
                    max_daily_budget = ?,
                    policy_source = ?,
                    updated_at = ?

                WHERE advertiser_id = ?
                  AND platform = ?
                  AND account_id = ?
                  AND campaign_id = ?
                """,
                (
                    min_budget,
                    max_budget,
                    "planner",
                    datetime.now().isoformat(),
                    payload.advertiserId,
                    "naver",
                    account_id,
                    campaign_id,
                ),
            )

            saved_count += 1

        connection.commit()

        return {
            "status":
                "ok",

            "advertiserId":
                payload.advertiserId,

            "platform":
                "naver",

            "accountId":
                account_id,

            "savedCount":
                saved_count,

            "productionWriteEnabled":
                False,

            "message":
                (
                    f"{saved_count}개 캠페인의 "
                    "Budget Policy를 저장했습니다."
                ),
        }

    finally:
        connection.close()

@app.post("/ad-connections/naver/sync-adgroups")
def sync_naver_adgroups(
    advertiserId: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        row = connection.execute(
            """
            SELECT
                id,
                advertiser_id,
                access_token,
                secret_key,
                customer_id,
                status
            FROM ad_connections
            WHERE platform = ?
              AND advertiser_id = ?
              AND status = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                advertiserId,
                "connected",
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_connected",
                "advertiserId": advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        access_license = row["access_token"]

        secret_key = row["secret_key"]

        customer_id = row["customer_id"]

        if not access_license or not secret_key or not customer_id:
            return {
                "status": "credentials_missing",
                "advertiserId": advertiserId,
                "message": "Naver Ads 인증정보가 완전하지 않습니다.",
            }

        api_base_url = "https://api.searchad.naver.com"

        uri = "/ncc/adgroups"
        method = "GET"

        timestamp = str(int(time.time() * 1000))

        signature = create_naver_signature(
            timestamp=timestamp,
            method=method,
            uri=uri,
            secret_key=secret_key,
        )

        headers = {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Timestamp": timestamp,
            "X-API-KEY": access_license,
            "X-Customer": str(customer_id),
            "X-Signature": signature,
        }

        response = requests.get(
            f"{api_base_url}{uri}",
            headers=headers,
            timeout=15,
        )

        if response.status_code != 200:
            return {
                "status": "failed",
                "advertiserId": advertiserId,
                "message": "Naver 광고그룹 조회에 실패했습니다.",
                "httpStatus": response.status_code,
                "detail": response.text[:500],
            }

        raw_adgroups = response.json()

        adgroups = []

        if isinstance(
            raw_adgroups,
            list,
        ):
            for adgroup in raw_adgroups:
                adgroups.append(
                    {
                        "id": adgroup.get("nccAdgroupId"),
                        "campaignId": adgroup.get("nccCampaignId"),
                        "name": adgroup.get("name"),
                        "bidAmt": adgroup.get("bidAmt"),
                        "status": adgroup.get("status"),
                        "userLock": adgroup.get("userLock"),
                        "adgroupType": adgroup.get("adgroupType"),
                        "pcChannelId": adgroup.get("pcChannelId"),
                        "mobileChannelId": adgroup.get("mobileChannelId"),
                    }
                )

        return {
            "status": "ok",
            "advertiserId": advertiserId,
            "connectionId": row["id"],
            "customerId": customer_id,
            "adgroupCount": len(adgroups),
            "adgroups": adgroups,
        }

    except requests.RequestException as error:
        return {
            "status": "error",
            "advertiserId": advertiserId,
            "message": "Naver 광고 API 서버에 연결하지 못했습니다.",
            "detail": str(error),
        }

    finally:
        connection.close()


# LEGACY:
# 기존 Naver /stats + last7days 기반 집계 API.
# 현재 운영 성과 데이터는
# AD_DETAIL + AD_CONVERSION_DETAIL 기반
# ad_performance_daily 파이프라인을 사용한다.
# 프론트 참조 여부 확인 후 제거 예정.
@app.post("/ad-connections/naver/sync-stats")
def sync_naver_stats(
    payload: NaverStatsSyncPayload,
    advertiserId: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        row = connection.execute(
            """
            SELECT
                id,
                advertiser_id,
                access_token,
                secret_key,
                customer_id,
                status
            FROM ad_connections
            WHERE platform = ?
              AND advertiser_id = ?
              AND status = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                advertiserId,
                "connected",
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_connected",
                "message": "저장된 Naver Ads 연결정보가 없습니다.",
            }

        if row["status"] != "connected":
            return {
                "status": "not_connected",
                "message": "Naver Ads 계정이 연결되어 있지 않습니다.",
            }

        access_license = row["access_token"]
        secret_key = row["secret_key"]
        customer_id = row["customer_id"]

        if not access_license or not secret_key or not customer_id:
            return {
                "status": "credentials_missing",
                "message": "Naver Ads 인증정보가 완전하지 않습니다.",
            }

        api_base_url = "https://api.searchad.naver.com"

        # 1. 먼저 캠페인 목록 조회
        campaign_uri = "/ncc/campaigns"
        campaign_method = "GET"

        campaign_timestamp = str(int(time.time() * 1000))

        campaign_signature = create_naver_signature(
            timestamp=campaign_timestamp,
            method=campaign_method,
            uri=campaign_uri,
            secret_key=secret_key,
        )

        campaign_headers = {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Timestamp": campaign_timestamp,
            "X-API-KEY": access_license,
            "X-Customer": str(customer_id),
            "X-Signature": campaign_signature,
        }

        campaign_response = requests.get(
            f"{api_base_url}{campaign_uri}",
            headers=campaign_headers,
            timeout=15,
        )

        if campaign_response.status_code != 200:
            return {
                "status": "failed",
                "message": "Naver 캠페인 조회에 실패했습니다.",
                "httpStatus": campaign_response.status_code,
                "detail": campaign_response.text[:500],
            }

        campaigns = campaign_response.json()

        if not isinstance(
            campaigns,
            list,
        ):
            return {
                "status": "failed",
                "message": "Naver 캠페인 응답 형식이 올바르지 않습니다.",
            }

        results = []

        # 2. 각 캠페인별 통계 조회
        for campaign in campaigns:
            campaign_id = campaign.get("nccCampaignId")

            if not campaign_id:
                continue

            stats_uri = "/stats"
            stats_method = "GET"

            stats_timestamp = str(int(time.time() * 1000))

            stats_signature = create_naver_signature(
                timestamp=stats_timestamp,
                method=stats_method,
                uri=stats_uri,
                secret_key=secret_key,
            )

            stats_headers = {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Timestamp": stats_timestamp,
                "X-API-KEY": access_license,
                "X-Customer": str(customer_id),
                "X-Signature": stats_signature,
            }

            params = {
                "ids": [campaign_id],
                "fields": (
                    '["clkCnt","impCnt","salesAmt",'
                    '"ctr","cpc","avgRnk","ccnt",'
                    '"convAmt"]'
                ),
                "datePreset": "last7days",
            }

            stats_response = requests.get(
                f"{api_base_url}{stats_uri}",
                headers=stats_headers,
                params=params,
                timeout=15,
            )

            if stats_response.status_code != 200:
                results.append(
                    {
                        "campaignId": campaign_id,
                        "campaignName": campaign.get("name"),
                        "status": "failed",
                        "httpStatus": stats_response.status_code,
                        "detail": stats_response.text[:300],
                    }
                )

                continue

            stats_data = stats_response.json()

            results.append(
                {
                    "campaignId": campaign_id,
                    "campaignName": campaign.get("name"),
                    "status": "ok",
                    "stats": stats_data,
                }
            )

        normalized_rows = []

        for result in results:
            if result.get("status") != "ok":
                continue

            stats = result.get("stats") or {}

            data_rows = stats.get("data") or []

            for stat in data_rows:
                spend = float(stat.get("salesAmt") or 0)

                impressions = int(stat.get("impCnt") or 0)

                clicks = float(stat.get("clkCnt") or 0)

                conversions = float(stat.get("ccnt") or 0)

                revenue = float(stat.get("convAmt") or 0)

                ctr = clicks / impressions * 100 if impressions > 0 else 0

                cpc = spend / clicks if clicks > 0 else 0

                cvr = conversions / clicks * 100 if clicks > 0 else 0

                cpa = spend / conversions if conversions > 0 else 0

                roas = revenue / spend * 100 if spend > 0 else 0

                normalized_rows.append(
                    {
                        "datePreset": "last7days",
                        "channel": "Naver",
                        "campaignId": result.get("campaignId"),
                        "campaign": result.get("campaignName"),
                        "spend": spend,
                        "impressions": impressions,
                        "clicks": clicks,
                        "conversions": conversions,
                        "revenue": revenue,
                        "ctr": ctr,
                        "cpc": cpc,
                        "cvr": cvr,
                        "cpa": cpa,
                        "roas": roas,
                    }
                )

        synced_at = datetime.utcnow().isoformat() + "Z"

        for row_data in normalized_rows:
            performance_id = (
                f"naver-"
                f"{customer_id}-"
                f"{row_data['datePreset']}-"
                f"{row_data['campaignId']}"
            )

            connection.execute(
                """
                INSERT INTO ad_performance (
                    id,
                    platform,
                    account_id,
                    date_preset,
                    campaign_id,
                    campaign_name,
                    channel,
                    spend,
                    impressions,
                    clicks,
                    conversions,
                    revenue,
                    ctr,
                    cpc,
                    cvr,
                    cpa,
                    roas,
                    synced_at
                )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                ON CONFLICT(
                    platform,
                    account_id,
                    date_preset,
                    campaign_id
                )
                DO UPDATE SET
                    campaign_name =
                        excluded.campaign_name,
                    channel =
                        excluded.channel,
                    spend =
                        excluded.spend,
                    impressions =
                        excluded.impressions,
                    clicks =
                        excluded.clicks,
                    conversions =
                        excluded.conversions,
                    revenue =
                        excluded.revenue,
                    ctr =
                        excluded.ctr,
                    cpc =
                        excluded.cpc,
                    cvr =
                        excluded.cvr,
                    cpa =
                        excluded.cpa,
                    roas =
                        excluded.roas,
                    synced_at =
                        excluded.synced_at
                """,
                (
                    performance_id,
                    "naver",
                    str(customer_id),
                    row_data["datePreset"],
                    row_data["campaignId"],
                    row_data["campaign"],
                    row_data["channel"],
                    row_data["spend"],
                    row_data["impressions"],
                    row_data["clicks"],
                    row_data["conversions"],
                    row_data["revenue"],
                    row_data["ctr"],
                    row_data["cpc"],
                    row_data["cvr"],
                    row_data["cpa"],
                    row_data["roas"],
                    synced_at,
                ),
            )

        connection.commit()

        return {
            "status": "ok",
            "customerId": customer_id,
            "since": payload.since,
            "until": payload.until,
            "campaignCount": len(campaigns),
            "results": results,
            "normalizedRows": normalized_rows,
            "savedCount": len(normalized_rows),
        }

    except requests.RequestException as error:
        return {
            "status": "error",
            "message": "Naver 광고 API 서버에 연결하지 못했습니다.",
            "detail": str(error),
        }

    finally:
        connection.close()


@app.post("/ad-connections/naver/create-daily-report")
def create_naver_daily_report(
    payload: NaverDailyReportPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        row = connection.execute(
            """
            SELECT
                id,
                advertiser_id,
                access_token,
                secret_key,
                customer_id,
                status
            FROM ad_connections
            WHERE platform = ?
              AND advertiser_id = ?
              AND status = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                payload.advertiserId,
                "connected",
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_connected",
                "advertiserId": payload.advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        if row["status"] != "connected":
            return {
                "status": "not_connected",
                "message": "Naver Ads 계정이 연결되어 있지 않습니다.",
            }

        access_license = row["access_token"]
        secret_key = row["secret_key"]
        customer_id = row["customer_id"]

        if not access_license or not secret_key or not customer_id:
            return {
                "status": "credentials_missing",
                "message": "Naver Ads 인증정보가 완전하지 않습니다.",
            }

        try:
            stat_date = datetime.strptime(
                payload.date,
                "%Y-%m-%d",
            ).strftime("%Y%m%d")

        except ValueError:
            return {
                "status": "invalid_date",
                "message": "날짜는 YYYY-MM-DD 형식으로 입력해주세요.",
            }

        api_base_url = "https://api.searchad.naver.com"

        # ---------------------------------
        # 1. 리포트 생성
        # ---------------------------------

        create_uri = "/stat-reports"
        create_method = "POST"

        timestamp = str(int(time.time() * 1000))

        signature = create_naver_signature(
            timestamp=timestamp,
            method=create_method,
            uri=create_uri,
            secret_key=secret_key,
        )

        headers = {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Timestamp": timestamp,
            "X-API-KEY": access_license,
            "X-Customer": str(customer_id),
            "X-Signature": signature,
        }

        create_response = requests.post(
            f"{api_base_url}{create_uri}",
            headers=headers,
            json={
                "reportTp": "AD_DETAIL",
                "statDt": stat_date,
            },
            timeout=15,
        )

        if create_response.status_code not in (
            200,
            201,
        ):
            return {
                "status": "failed",
                "stage": "create",
                "httpStatus": create_response.status_code,
                "detail": create_response.text[:500],
            }

        report = create_response.json()

        report_job_id = report.get("reportJobId")

        report_status = report.get("status")

        if not report_job_id:
            return {
                "status": "failed",
                "stage": "create",
                "message": "reportJobId를 받지 못했습니다.",
                "detail": report,
            }

        # ---------------------------------
        # 2. 생성 완료 여부 확인
        # ---------------------------------

        max_attempts = 12

        for _ in range(max_attempts):
            if report_status not in (
                "REGIST",
                "RUNNING",
                "WAITING",
            ):
                break

            time.sleep(2)

            get_uri = f"/stat-reports/" f"{report_job_id}"

            get_method = "GET"

            get_timestamp = str(int(time.time() * 1000))

            get_signature = create_naver_signature(
                timestamp=get_timestamp,
                method=get_method,
                uri=get_uri,
                secret_key=secret_key,
            )

            get_headers = {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Timestamp": get_timestamp,
                "X-API-KEY": access_license,
                "X-Customer": str(customer_id),
                "X-Signature": get_signature,
            }

            get_response = requests.get(
                f"{api_base_url}{get_uri}",
                headers=get_headers,
                timeout=15,
            )

            if get_response.status_code != 200:
                return {
                    "status": "failed",
                    "stage": "status_check",
                    "httpStatus": get_response.status_code,
                    "detail": get_response.text[:500],
                }

            report = get_response.json()

            report_status = report.get("status")

        # ---------------------------------
        # 3. 최종 결과
        # ---------------------------------

        if report_status == "BUILT":
            download_url = report.get("downloadUrl")

            if not download_url:
                return {
                    "status": "failed",
                    "stage": "download",
                    "message": "Naver 리포트 downloadUrl을 받지 못했습니다.",
                }

            download_uri = "/report-download"

            download_timestamp = str(int(time.time() * 1000))

            download_signature = create_naver_signature(
                timestamp=download_timestamp,
                method="GET",
                uri=download_uri,
                secret_key=secret_key,
            )

            download_headers = {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Timestamp": download_timestamp,
                "X-API-KEY": access_license,
                "X-Customer": str(customer_id),
                "X-Signature": download_signature,
            }

            download_response = requests.get(
                download_url,
                headers=download_headers,
                timeout=30,
            )

            if download_response.status_code != 200:
                return {
                    "status": "failed",
                    "stage": "download",
                    "httpStatus": download_response.status_code,
                    "detail": download_response.text[:500],
                }

            report_text = download_response.content.decode(
                "utf-8-sig",
                errors="replace",
            )

            report_lines = [line for line in report_text.splitlines() if line.strip()]

            if not report_lines:
                return {
                    "status": "no_data",
                    "reportStatus": report_status,
                    "reportJobId": report_job_id,
                    "date": payload.date,
                    "message": "다운로드된 리포트가 비어 있습니다.",
                }

            preview_rows = []

            for line in report_lines[:5]:
                values = line.split("\t")

                preview_rows.append(values)

            column_count = len(preview_rows[0]) if preview_rows else 0

            performance_map = {}

            for line in report_lines:
                values = line.split("\t")

                if len(values) < 16:
                    continue

                row_date = values[0]
                campaign_id = values[2]

                if not row_date or not campaign_id:
                    continue

                try:
                    impressions = float(values[11] or 0)
                except ValueError:
                    impressions = 0

                try:
                    clicks = float(values[12] or 0)
                except ValueError:
                    clicks = 0

                try:
                    spend = float(values[13] or 0)
                except ValueError:
                    spend = 0

                key = (
                    row_date,
                    campaign_id,
                )

                if key not in performance_map:
                    performance_map[key] = {
                        "date": row_date,
                        "campaignId": campaign_id,
                        "impressions": 0,
                        "clicks": 0,
                        "spend": 0,
                    }

                performance_map[key]["impressions"] += impressions

                performance_map[key]["clicks"] += clicks

                performance_map[key]["spend"] += spend

            performance_rows = list(performance_map.values())

            return {
                "status": "ok",
                "reportStatus": report_status,
                "reportJobId": report_job_id,
                "date": payload.date,
                "statDate": stat_date,
                "rowCount": len(report_lines),
                "columnCount": column_count,
                "previewRows": preview_rows,
                "performanceRows": performance_rows,
            }

        if report_status == "NONE":
            return {
                "status": "no_data",
                "reportStatus": report_status,
                "reportJobId": report_job_id,
                "date": payload.date,
                "message": "해당 날짜의 리포트 데이터가 없습니다.",
            }

        if report_status == "ERROR":
            return {
                "status": "failed",
                "reportStatus": report_status,
                "reportJobId": report_job_id,
                "message": "Naver 일별 리포트 생성에 실패했습니다.",
            }

        if report_status == "AGGREGATING":
            return {
                "status": "pending",
                "reportStatus": report_status,
                "reportJobId": report_job_id,
                "date": payload.date,
                "message": "해당 날짜의 통계 집계가 아직 완료되지 않았습니다.",
            }

        return {
            "status": "pending",
            "reportStatus": report_status,
            "reportJobId": report_job_id,
            "date": payload.date,
            "message": "리포트 생성이 아직 완료되지 않았습니다.",
        }

    except requests.RequestException as error:
        return {
            "status": "error",
            "message": "Naver 광고 API 서버에 연결하지 못했습니다.",
            "detail": str(error),
        }

    finally:
        connection.close()


@app.post("/ad-connections/naver/create-daily-conversion-report")
def create_naver_daily_conversion_report(
    payload: NaverDailyReportPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        row = connection.execute(
            """
            SELECT
                id,
                advertiser_id,
                access_token,
                secret_key,
                customer_id,
                status
            FROM ad_connections
            WHERE platform = ?
              AND advertiser_id = ?
              AND status = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                payload.advertiserId,
                "connected",
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_connected",
                "advertiserId": payload.advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        if row["status"] != "connected":
            return {
                "status": "not_connected",
                "message": "Naver Ads 계정이 연결되어 있지 않습니다.",
            }

        access_license = row["access_token"]
        secret_key = row["secret_key"]
        customer_id = row["customer_id"]

        if not access_license or not secret_key or not customer_id:
            return {
                "status": "credentials_missing",
                "message": "Naver Ads 인증정보가 완전하지 않습니다.",
            }

        try:
            stat_date = datetime.strptime(
                payload.date,
                "%Y-%m-%d",
            ).strftime("%Y%m%d")

        except ValueError:
            return {
                "status": "invalid_date",
                "message": "날짜는 YYYY-MM-DD 형식으로 입력해주세요.",
            }

        api_base_url = "https://api.searchad.naver.com"

        # ---------------------------------
        # 1. 리포트 생성
        # ---------------------------------

        create_uri = "/stat-reports"
        create_method = "POST"

        timestamp = str(int(time.time() * 1000))

        signature = create_naver_signature(
            timestamp=timestamp,
            method=create_method,
            uri=create_uri,
            secret_key=secret_key,
        )

        headers = {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Timestamp": timestamp,
            "X-API-KEY": access_license,
            "X-Customer": str(customer_id),
            "X-Signature": signature,
        }

        create_response = requests.post(
            f"{api_base_url}{create_uri}",
            headers=headers,
            json={
                "reportTp": "AD_CONVERSION_DETAIL",
                "statDt": stat_date,
            },
            timeout=15,
        )

        if create_response.status_code not in (
            200,
            201,
        ):
            return {
                "status": "failed",
                "stage": "create",
                "httpStatus": create_response.status_code,
                "detail": create_response.text[:500],
            }

        report = create_response.json()

        report_job_id = report.get("reportJobId")

        report_status = report.get("status")

        if not report_job_id:
            return {
                "status": "failed",
                "stage": "create",
                "message": "reportJobId를 받지 못했습니다.",
                "detail": report,
            }

        # ---------------------------------
        # 2. 생성 완료 여부 확인
        # ---------------------------------

        max_attempts = 12

        for _ in range(max_attempts):
            if report_status not in (
                "REGIST",
                "RUNNING",
                "WAITING",
            ):
                break

            time.sleep(2)

            get_uri = f"/stat-reports/" f"{report_job_id}"

            get_method = "GET"

            get_timestamp = str(int(time.time() * 1000))

            get_signature = create_naver_signature(
                timestamp=get_timestamp,
                method=get_method,
                uri=get_uri,
                secret_key=secret_key,
            )

            get_headers = {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Timestamp": get_timestamp,
                "X-API-KEY": access_license,
                "X-Customer": str(customer_id),
                "X-Signature": get_signature,
            }

            get_response = requests.get(
                f"{api_base_url}{get_uri}",
                headers=get_headers,
                timeout=15,
            )

            if get_response.status_code != 200:
                return {
                    "status": "failed",
                    "stage": "status_check",
                    "httpStatus": get_response.status_code,
                    "detail": get_response.text[:500],
                }

            report = get_response.json()

            report_status = report.get("status")

        # ---------------------------------
        # 3. 최종 결과
        # ---------------------------------

        if report_status == "BUILT":
            download_url = report.get("downloadUrl")

            if not download_url:
                return {
                    "status": "failed",
                    "stage": "download",
                    "message": "Naver 리포트 downloadUrl을 받지 못했습니다.",
                }

            download_uri = "/report-download"

            download_timestamp = str(int(time.time() * 1000))

            download_signature = create_naver_signature(
                timestamp=download_timestamp,
                method="GET",
                uri=download_uri,
                secret_key=secret_key,
            )

            download_headers = {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Timestamp": download_timestamp,
                "X-API-KEY": access_license,
                "X-Customer": str(customer_id),
                "X-Signature": download_signature,
            }

            download_response = requests.get(
                download_url,
                headers=download_headers,
                timeout=30,
            )

            if download_response.status_code != 200:
                return {
                    "status": "failed",
                    "stage": "download",
                    "httpStatus": download_response.status_code,
                    "detail": download_response.text[:500],
                }

            report_text = download_response.content.decode(
                "utf-8-sig",
                errors="replace",
            )

            report_lines = [line for line in report_text.splitlines() if line.strip()]

            if not report_lines:
                return {
                    "status": "no_data",
                    "reportStatus": report_status,
                    "reportJobId": report_job_id,
                    "date": payload.date,
                    "message": "다운로드된 리포트가 비어 있습니다.",
                }

            preview_rows = []

            for line in report_lines[:5]:
                values = line.split("\t")

                preview_rows.append(values)

            column_count = len(preview_rows[0]) if preview_rows else 0

            conversion_map = {}

            for line in report_lines:
                values = line.split("\t")

                if len(values) < 15:
                    continue

                row_date = values[0]
                campaign_id = values[2]

                try:
                    conversions = float(values[13] or 0)

                except ValueError:
                    conversions = 0

                try:
                    revenue = float(values[14] or 0)

                except ValueError:
                    revenue = 0

                key = (
                    row_date,
                    campaign_id,
                )

                if key not in conversion_map:
                    conversion_map[key] = {
                        "date": row_date,
                        "campaignId": campaign_id,
                        "conversions": 0,
                        "revenue": 0,
                    }

                conversion_map[key]["conversions"] += conversions

                conversion_map[key]["revenue"] += revenue

            conversion_rows = list(conversion_map.values())

            return {
                "status": "ok",
                "reportStatus": report_status,
                "reportJobId": report_job_id,
                "date": payload.date,
                "statDate": stat_date,
                "rowCount": len(report_lines),
                "columnCount": column_count,
                "previewRows": preview_rows,
                "conversionRows": conversion_rows,
            }

        if report_status == "NONE":
            return {
                "status": "no_data",
                "reportStatus": report_status,
                "reportJobId": report_job_id,
                "date": payload.date,
                "message": "해당 날짜의 리포트 데이터가 없습니다.",
            }

        if report_status == "ERROR":
            return {
                "status": "failed",
                "reportStatus": report_status,
                "reportJobId": report_job_id,
                "message": "Naver 일별 리포트 생성에 실패했습니다.",
            }

        if report_status == "AGGREGATING":
            return {
                "status": "pending",
                "reportStatus": report_status,
                "reportJobId": report_job_id,
                "date": payload.date,
                "message": "해당 날짜의 통계 집계가 아직 완료되지 않았습니다.",
            }

        return {
            "status": "pending",
            "reportStatus": report_status,
            "reportJobId": report_job_id,
            "date": payload.date,
            "message": "리포트 생성이 아직 완료되지 않았습니다.",
        }

    except requests.RequestException as error:
        return {
            "status": "error",
            "message": "Naver 광고 API 서버에 연결하지 못했습니다.",
            "detail": str(error),
        }

    finally:
        connection.close()


@app.post("/ad-connections/naver/sync-daily-performance")
def sync_naver_daily_performance(
    payload: NaverDailyReportPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

    finally:
        connection.close()

    # 1. AD_DETAIL 조회
    performance_result = create_naver_daily_report(
        payload,
        token_payload=token_payload,
    )

    if performance_result.get("status") != "ok":
        is_no_performance_data = (
            performance_result.get("stage") == "create"
            and performance_result.get("httpStatus") == 400
            and "10004" in str(performance_result.get("detail", ""))
        )

        if is_no_performance_data:
            return {
                "status": "ok",
                "date": payload.date,
                "savedCount": 0,
                "noData": True,
                "message": "해당 날짜에는 Naver 광고 성과 데이터가 없습니다.",
            }

        return {
            "status": "failed",
            "stage": "performance_report",
            "detail": performance_result,
        }

    performance_rows = performance_result.get("performanceRows") or []

    # 2. AD_CONVERSION_DETAIL 조회
    conversion_result = create_naver_daily_conversion_report(
        payload,
        token_payload=token_payload,
    )

    conversion_status = (
        conversion_result.get("status")
    )

    conversion_rows = []

    conversion_report_available = False

    conversion_detail = str(
        conversion_result.get(
            "detail",
            "",
        )
    )

    # -----------------------------------------
    # A. Conversion Report가 정상 생성됨
    #
    # conversionRows가 비어 있더라도
    # 실제 전환 0건일 수 있으므로
    # 이것은 유효한 데이터로 취급한다.
    # -----------------------------------------

    if conversion_status == "ok":
        conversion_report_available = True

        conversion_rows = (
            conversion_result.get(
                "conversionRows"
            )
            or []
        )

    # -----------------------------------------
    # B. 과거 retention 등으로
    #    Conversion Report 자체가 없음
    #
    # 이 경우 0건으로 해석하지 않는다.
    # 기존 DB conversion/revenue를 보존한다.
    # -----------------------------------------

    elif (
        conversion_status == "failed"
        and conversion_result.get(
            "stage"
        ) == "create"
        and conversion_result.get(
            "httpStatus"
        ) == 400
        and (
            "10004" in conversion_detail
            or "11004" in conversion_detail
        )
    ):
        conversion_report_available = False

        conversion_rows = []

    # -----------------------------------------
    # C. 그 외 API 오류
    # -----------------------------------------

    else:
        return {
            "status": "failed",
            "stage": "conversion_report",
            "detail": conversion_result,
        }

    # 3. 전환 데이터를
    # date + campaignId 기준으로 lookup
    conversion_map = {}

    for row in conversion_rows:
        key = (
            row.get("date"),
            row.get("campaignId"),
        )

        conversion_map[key] = {
            "conversions": float(
                row.get(
                    "conversions",
                    0,
                )
                or 0
            ),
            "revenue": float(
                row.get(
                    "revenue",
                    0,
                )
                or 0
            ),
        }

    # 4. AD_DETAIL + 전환 데이터 JOIN
    merged_rows = []

    for row in performance_rows:
        row_date = row.get("date")

        campaign_id = row.get("campaignId")

        key = (
            row_date,
            campaign_id,
        )

        conversion_data = conversion_map.get(
            key,
            {
                "conversions": 0,
                "revenue": 0,
            },
        )

        spend = float(row.get("spend", 0) or 0)

        impressions = float(
            row.get(
                "impressions",
                0,
            )
            or 0
        )

        clicks = float(row.get("clicks", 0) or 0)

        conversions = float(conversion_data["conversions"])

        revenue = float(conversion_data["revenue"])

        ctr = clicks / impressions * 100 if impressions > 0 else 0

        cpc = spend / clicks if clicks > 0 else 0

        cvr = conversions / clicks * 100 if clicks > 0 else 0

        cpa = spend / conversions if conversions > 0 else 0

        roas = revenue / spend * 100 if spend > 0 else 0

        # YYYYMMDD → YYYY-MM-DD
        formatted_date = datetime.strptime(
            row_date,
            "%Y%m%d",
        ).strftime("%Y-%m-%d")

        merged_rows.append(
            {
                "date": formatted_date,
                "campaignId": campaign_id,
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "revenue": revenue,
                "ctr": ctr,
                "cpc": cpc,
                "cvr": cvr,
                "cpa": cpa,
                "roas": roas,
                "conversionDataAvailable":
                    conversion_report_available,
            }
        )

    # 5. Campaign ID → 이름 조회
    campaign_result = sync_naver_campaigns(
        advertiserId=payload.advertiserId,
        token_payload=token_payload,
    )
    campaign_map = {}

    if campaign_result.get("status") == "ok":
        for campaign in campaign_result.get("campaigns") or []:
            campaign_map[campaign.get("id")] = campaign.get("name")

    # 6. account 정보 조회
    connection = get_db_connection()

    try:
        account_row = connection.execute(
            """
                SELECT
                    account_id,
                    customer_id,
                    advertiser_id
                FROM ad_connections
                WHERE platform = ?
                  AND status = ?
                  AND advertiser_id = ?
                ORDER BY updated_at DESC
                LIMIT 1
                """,
            (
                "naver",
                "connected",
                payload.advertiserId,
            ),
        ).fetchone()

        if account_row is None:
            return {
                "status": "not_connected",
                "advertiserId": payload.advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        account_id = account_row["customer_id"] or account_row["account_id"]

        advertiser_id = account_row["advertiser_id"]

        synced_at = (
            datetime.now(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
        )

        # 7. DB 저장
        for row in merged_rows:
            campaign_id = row["campaignId"]

            campaign_name = campaign_map.get(campaign_id) or campaign_id

            performance_id = (
                f"naver-" f"{account_id}-" f"{row['date']}-" f"{campaign_id}"
            )

            connection.execute(
                """
                INSERT INTO
                    ad_performance_daily (
                        id,
                        advertiser_id,
                        platform,
                        account_id,
                        date,
                        campaign_id,
                        campaign_name,
                        channel,
                        spend,
                        impressions,
                        clicks,
                        conversions,
                        revenue,
                        ctr,
                        cpc,
                        cvr,
                        cpa,
                        roas,
                        synced_at
                    )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?
                )

                ON CONFLICT(
                    platform,
                    account_id,
                    date,
                    campaign_id
                )
                DO UPDATE SET
                    advertiser_id =
                        excluded.advertiser_id,
                    campaign_name =
                        excluded.campaign_name,
                    channel =
                        excluded.channel,
                    spend =
                        excluded.spend,
                    impressions =
                        excluded.impressions,
                    clicks =
                        excluded.clicks,
                    conversions =
                        CASE
                            WHEN ? = 1
                            THEN excluded.conversions
                            ELSE ad_performance_daily.conversions
                        END,
                    revenue =
                        CASE
                            WHEN ? = 1
                            THEN excluded.revenue
                            ELSE ad_performance_daily.revenue
                        END,
                    ctr =
                        excluded.ctr,
                    cpc =
                        excluded.cpc,
                    cvr =
                        CASE
                            WHEN ? = 1
                            THEN excluded.cvr
                            ELSE ad_performance_daily.cvr
                        END,
                    cpa =
                        CASE
                            WHEN ? = 1
                            THEN excluded.cpa
                            ELSE ad_performance_daily.cpa
                        END,
                    roas =
                        CASE
                            WHEN ? = 1
                            THEN excluded.roas
                            ELSE ad_performance_daily.roas
                        END,
                    synced_at =
                        excluded.synced_at
                """,
                (
                    performance_id,
                    advertiser_id,
                    "naver",
                    str(account_id),
                    row["date"],
                    campaign_id,
                    campaign_name,
                    "Naver",
                    row["spend"],
                    row["impressions"],
                    row["clicks"],
                    row["conversions"],
                    row["revenue"],
                    row["ctr"],
                    row["cpc"],
                    row["cvr"],
                    row["cpa"],
                    row["roas"],
                    synced_at,

                    1
                    if conversion_report_available
                    else 0,

                    1
                    if conversion_report_available
                    else 0,

                    1
                    if conversion_report_available
                    else 0,

                    1
                    if conversion_report_available
                    else 0,

                    1
                    if conversion_report_available
                    else 0,
                ),
            )

        connection.commit()

        return {
            "status": "ok",
            "date": payload.date,
            "savedCount": len(merged_rows),
            "performanceRowCount":
                len(performance_rows),

            "conversionRowCount":
                len(conversion_rows),

            "conversionDataAvailable":
                conversion_report_available,

            "conversionDataPreserved":
                not conversion_report_available,

            "mergedRows":
                merged_rows,
        }

    finally:
        connection.close()


def sync_naver_performance_range_internal(
    payload: NaverPerformanceRangePayload,
    token_payload,
):
    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }
    try:
        start_date = datetime.strptime(
            payload.since,
            "%Y-%m-%d",
        )

        end_date = datetime.strptime(
            payload.until,
            "%Y-%m-%d",
        )

    except ValueError:
        return {
            "status": "invalid_date",
            "message": "날짜는 YYYY-MM-DD 형식으로 입력해주세요.",
        }

    if start_date > end_date:
        return {
            "status": "invalid_range",
            "message": "since 날짜는 until 날짜보다 늦을 수 없습니다.",
        }

    results = []

    current_date = start_date

    while current_date <= end_date:
        date_string = current_date.strftime("%Y-%m-%d")

        daily_payload = NaverDailyReportPayload(
            date=date_string,
            advertiserId=payload.advertiserId,
        )

        try:
            daily_result = sync_naver_daily_performance(
                daily_payload,
                token_payload=token_payload,
            )

            results.append(
                {
                    "date": date_string,
                    "status": daily_result.get("status"),
                    "savedCount": daily_result.get(
                        "savedCount",
                        0,
                    ),
                    "detail": daily_result,
                }
            )

        except Exception as error:
            results.append(
                {
                    "date": date_string,
                    "status": "error",
                    "savedCount": 0,
                    "detail": str(error),
                }
            )

        current_date += timedelta(days=1)

    successful_days = [row for row in results if row["status"] == "ok"]

    failed_days = [row for row in results if row["status"] != "ok"]

    total_saved = sum(
        row.get(
            "savedCount",
            0,
        )
        for row in successful_days
    )

    return {
        "status": "ok",
        "advertiserId": payload.advertiserId,
        "since": payload.since,
        "until": payload.until,
        "totalDays": len(results),
        "successfulDays": len(successful_days),
        "failedDays": len(failed_days),
        "totalSaved": total_saved,
        "results": results,
    }

@app.post("/ad-connections/naver/sync-performance-range")
def sync_naver_performance_range(
    payload: NaverPerformanceRangePayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

    finally:
        connection.close()

    return sync_naver_performance_range_internal(
        payload,
        token_payload,
    )


@app.post("/ad-connections/naver/sync-latest")
def sync_naver_latest_performance(
    advertiserId: str,
    token_payload = Depends(
        require_operator
    ),
):
    # -----------------------------------------
    # 1. Operator JWT 검증
    # -----------------------------------------

    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 2. 광고주 ownership 검증
        # -----------------------------------------

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        # -----------------------------------------
        # 3. 현재 광고주에 연결된 Naver 계정 확인
        # -----------------------------------------

        account_row = connection.execute(
            """
            SELECT
                account_id,
                customer_id,
                advertiser_id
            FROM ad_connections
            WHERE platform = ?
              AND status = ?
              AND advertiser_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                "connected",
                advertiserId,
            ),
        ).fetchone()

        if account_row is None:
            return {
                "status": "not_connected",
                "advertiserId": advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        current_account_id = (
            account_row["customer_id"]
            or account_row["account_id"]
        )

        if not current_account_id:
            return {
                "status": "account_missing",
                "advertiserId": advertiserId,
                "message": "현재 Naver Ads 계정 식별값을 확인할 수 없습니다.",
            }

        current_account_id = str(
            current_account_id
        )

        # -----------------------------------------
        # 4. 마지막 저장 날짜 확인
        # -----------------------------------------

        latest_row = connection.execute(
            """
            SELECT MAX(date) AS latest_date
            FROM ad_performance_daily
            WHERE platform = ?
              AND advertiser_id = ?
              AND account_id = ?
            """,
            (
                "naver",
                advertiserId,
                current_account_id,
            ),
        ).fetchone()

        latest_date = (
            latest_row["latest_date"]
            if latest_row
            else None
        )

    finally:
        connection.close()

    today = datetime.now().date()

    yesterday = (
        today - timedelta(days=1)
    )

    # -----------------------------------------
    # 5. 동기화 시작일 결정
    # -----------------------------------------

    if latest_date:
        try:
            latest_date_value = (
                datetime.strptime(
                    latest_date,
                    "%Y-%m-%d",
                ).date()
            )

        except ValueError:
            return {
                "status": "error",
                "message": "DB의 마지막 동기화 날짜 형식이 올바르지 않습니다.",
                "advertiserId": advertiserId,
                "latestDate": latest_date,
                "accountId": current_account_id,
            }

        sync_start = (
            latest_date_value
            + timedelta(days=1)
        )

        sync_mode = "incremental"

    else:
        sync_start = (
            yesterday
            - timedelta(days=29)
        )

        sync_mode = "initial_backfill"

    # -----------------------------------------
    # 6. 이미 최신 상태인지 확인
    # -----------------------------------------

    if sync_start > yesterday:
        return {
            "status": "ok",
            "syncMode": "up_to_date",
            "message": "선택한 광고주의 Naver 데이터는 이미 최신 상태입니다.",
            "advertiserId": advertiserId,
            "accountId": current_account_id,
            "latestDate": latest_date,
            "syncSince": None,
            "syncUntil": None,
            "totalDays": 0,
            "successfulDays": 0,
            "failedDays": 0,
            "totalSaved": 0,
        }

    # -----------------------------------------
    # 7. 필요한 기간 동기화
    # -----------------------------------------

    range_payload = (
        NaverPerformanceRangePayload(
            since=sync_start.strftime(
                "%Y-%m-%d"
            ),
            until=yesterday.strftime(
                "%Y-%m-%d"
            ),
            advertiserId=advertiserId,
        )
    )

    range_result = (
        sync_naver_performance_range_internal(
            range_payload,
            token_payload,
        )
    )

    return {
        "status": range_result.get(
            "status",
            "error",
        ),
        "syncMode": sync_mode,
        "advertiserId": advertiserId,
        "accountId": current_account_id,
        "previousLatestDate": latest_date,
        "syncSince": range_payload.since,
        "syncUntil": range_payload.until,
        "totalDays": range_result.get(
            "totalDays",
            0,
        ),
        "successfulDays": range_result.get(
            "successfulDays",
            0,
        ),
        "failedDays": range_result.get(
            "failedDays",
            0,
        ),
        "totalSaved": range_result.get(
            "totalSaved",
            0,
        ),
        "results": range_result.get(
            "results",
            [],
        ),
    }


@app.post("/ad-connections/naver/backfill-90d")
def backfill_naver_90_days(
    advertiserId: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

    finally:
        connection.close()

    today = datetime.now().date()

    yesterday = today - timedelta(days=1)

    backfill_start = (
        yesterday - timedelta(days=89)
    )

    range_payload = NaverPerformanceRangePayload(
        since=backfill_start.strftime(
            "%Y-%m-%d"
        ),
        until=yesterday.strftime(
            "%Y-%m-%d"
        ),
        advertiserId=advertiserId,
    )

    result = sync_naver_performance_range(
        range_payload,
        token_payload=token_payload,
    )

    return {
        "status": result.get(
            "status",
            "error",
        ),
        "mode": "historical_backfill_90d",
        "advertiserId": advertiserId,
        "backfillSince": range_payload.since,
        "backfillUntil": range_payload.until,
        "totalDays": result.get(
            "totalDays",
            0,
        ),
        "successfulDays": result.get(
            "successfulDays",
            0,
        ),
        "failedDays": result.get(
            "failedDays",
            0,
        ),
        "totalSaved": result.get(
            "totalSaved",
            0,
        ),
        "results": result.get(
            "results",
            [],
        ),
    }

def check_naver_history_window(
    base_date,
    window_days: int = 3,
    advertiser_id: str | None = None,
    token_payload=None,
):
    if not advertiser_id:
        return {
            "available": False,
            "availableDate": None,
            "tested": [],
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    tested = []

    for offset in range(window_days):
        test_date = (
            base_date
            + timedelta(days=offset)
        )

        if test_date >= datetime.now().date():
            break

        try:
            result = create_naver_daily_report(
                NaverDailyReportPayload(
                    date=test_date.isoformat(),
                    advertiserId=advertiser_id,
                ),
                token_payload=token_payload,
            )

            available = (
                result.get("status") == "ok"
                and result.get("reportStatus")
                == "BUILT"
            )

            tested.append(
                {
                    "date":
                        test_date.isoformat(),
                    "available":
                        available,
                    "status":
                        result.get("status"),
                    "reportStatus":
                        result.get(
                            "reportStatus"
                        ),
                    "stage":
                        result.get("stage"),
                    "httpStatus":
                        result.get(
                            "httpStatus"
                        ),
                }
            )

            if available:
                return {
                    "available": True,
                    "availableDate":
                        test_date,
                    "advertiserId":
                        advertiser_id,
                    "tested":
                        tested,
                }

        except Exception as error:
            tested.append(
                {
                    "date":
                        test_date.isoformat(),
                    "available":
                        False,
                    "error":
                        str(error),
                }
            )

    return {
        "available": False,
        "availableDate": None,
        "advertiserId": advertiser_id,
        "tested": tested,
    }


@app.post("/ad-connections/naver/history-probe")
def probe_naver_history(
    payload: NaverHistoryProbePayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

    finally:
        connection.close()

    try:
        probe_date = datetime.strptime(
            payload.date,
            "%Y-%m-%d",
        ).date()
    except ValueError:
        return {
            "status": "error",
            "advertiserId": payload.advertiserId,
            "message": "date는 YYYY-MM-DD 형식이어야 합니다.",
        }

    yesterday = datetime.now().date() - timedelta(days=1)

    if probe_date > yesterday:
        return {
            "status": "error",
            "advertiserId": payload.advertiserId,
            "message": "어제 이전 날짜만 확인할 수 있습니다.",
        }

    try:
        result = create_naver_daily_report(
            NaverDailyReportPayload(
                date=probe_date.isoformat(),
                advertiserId=payload.advertiserId,
            ),
            token_payload=token_payload,
        )

        report_status = result.get("reportStatus")

        rows = result.get("rows", [])

        available = result.get("status") == "ok" and report_status == "BUILT"

        return {
            "status": "ok",
            "advertiserId": payload.advertiserId,
            "date": probe_date.isoformat(),
            "available": available,
            "reportStatus": report_status,
            "rowCount": len(rows),
            "sourceStatus": result.get("status"),
            "sourceStage": result.get("stage"),
            "sourceMessage": result.get("message"),
            "sourceHttpStatus": result.get("httpStatus"),
            "sourceDetail": result.get("detail"),
            "sourceKeys": list(result.keys()),
            "message": (
                "해당 날짜의 보고서를 생성할 수 있습니다."
                if available
                else "해당 날짜의 보고서를 확인할 수 없습니다."
            ),
        }

    except Exception as error:
        return {
            "status": "ok",
            "advertiserId": payload.advertiserId,
            "date": probe_date.isoformat(),
            "available": False,
            "reportStatus": "ERROR",
            "rowCount": 0,
            "error": str(error),
        }


def find_naver_history_coverage_internal(
    advertiser_id: str,
    max_lookback_days: int = 730,
    step_days: int = 30,
    probe_window_days: int = 3,
    token_payload=None,
):
    if not advertiser_id:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    yesterday = datetime.now().date() - timedelta(days=1)

    oldest_limit = yesterday - timedelta(days=max_lookback_days - 1)

    tested_windows = []

    last_available_date = None
    first_unavailable_date = None

    cursor = yesterday

    while cursor >= oldest_limit:
        window_result = check_naver_history_window(
            cursor,
            probe_window_days,
            advertiser_id,
            token_payload,
        )

        tested_windows.append(
            {
                "baseDate": cursor.isoformat(),
                "available": window_result["available"],
                "availableDate": (
                    window_result["availableDate"].isoformat()
                    if window_result["availableDate"]
                    else None
                ),
            }
        )

        if window_result["available"]:
            last_available_date = window_result["availableDate"]

            cursor = cursor - timedelta(days=step_days)

            continue

        first_unavailable_date = cursor
        break

    if first_unavailable_date is None:
        return {
            "status": "ok",
            "advertiserId": advertiser_id,
            "earliestAvailableDate": oldest_limit.isoformat(),
            "latestAvailableDate": yesterday.isoformat(),
            "searchLimitReached": True,
            "testedWindows": tested_windows,
        }

    if last_available_date is None:
        return {
            "status": "not_found",
            "advertiserId": advertiser_id,
            "earliestAvailableDate": None,
            "latestAvailableDate": yesterday.isoformat(),
            "searchLimitReached": False,
            "testedWindows": tested_windows,
        }

    lower_date = max(
        first_unavailable_date,
        oldest_limit,
    )

    upper_date = last_available_date

    if lower_date > upper_date:
        lower_date, upper_date = (
            upper_date,
            lower_date,
        )

    earliest_available = None

    current_date = lower_date

    while current_date <= upper_date:
        window_result = check_naver_history_window(
            current_date,
            1,
            advertiser_id,
            token_payload,
        )

        if window_result["available"]:
            earliest_available = window_result["availableDate"]
            break

        current_date += timedelta(days=1)

    if earliest_available is None:
        earliest_available = last_available_date

    return {
        "status": "ok",
        "advertiserId": advertiser_id,
        "earliestAvailableDate": earliest_available.isoformat(),
        "latestAvailableDate": yesterday.isoformat(),
        "searchLimitReached": False,
        "testedWindows": tested_windows,
    }

def check_naver_conversion_history_window(
    base_date,
    window_days: int,
    advertiser_id: str,
    token_payload,
):
    tested = []

    for offset in range(window_days):
        test_date = (
            base_date
            - timedelta(days=offset)
        )

        if test_date >= datetime.now().date():
            continue

        try:
            result = (
                create_naver_daily_conversion_report(
                    NaverDailyReportPayload(
                        date=test_date.isoformat(),
                        advertiserId=advertiser_id,
                    ),
                    token_payload=token_payload,
                )
            )

            available = (
                result.get("status") == "ok"
                and result.get("reportStatus")
                == "BUILT"
            )

            tested.append(
                {
                    "date":
                        test_date.isoformat(),

                    "available":
                        available,

                    "status":
                        result.get("status"),

                    "reportStatus":
                        result.get(
                            "reportStatus"
                        ),

                    "rowCount":
                        result.get(
                            "rowCount"
                        ),

                    "conversionRowCount":
                        len(
                            result.get(
                                "conversionRows"
                            )
                            or []
                        ),

                    "stage":
                        result.get("stage"),

                    "httpStatus":
                        result.get(
                            "httpStatus"
                        ),

                    "detail":
                        str(
                            result.get(
                                "detail",
                                "",
                            )
                        )[:300],
                }
            )

            if available:
                return {
                    "available":
                        True,

                    "availableDate":
                        test_date,

                    "tested":
                        tested,
                }

        except Exception as error:
            tested.append(
                {
                    "date":
                        test_date.isoformat(),

                    "available":
                        False,

                    "error":
                        str(error),
                }
            )

    return {
        "available":
            False,

        "availableDate":
            None,

        "tested":
            tested,
    }


def find_naver_conversion_history_coverage_internal(
    advertiser_id: str,
    max_lookback_days: int = 180,
    step_days: int = 14,
    probe_window_days: int = 3,
    token_payload=None,
):
    if not advertiser_id:
        return {
            "status": "error",
            "message":
                "advertiserId가 필요합니다.",
        }

    yesterday = (
        datetime.now().date()
        - timedelta(days=1)
    )

    oldest_limit = (
        yesterday
        - timedelta(
            days=max_lookback_days - 1
        )
    )

    tested_windows = []

    newest_available_date = None
    oldest_known_available_date = None
    first_older_unavailable_date = None

    cursor = yesterday

    # -----------------------------------------
    # 1. 최신 → 과거 방향 coarse search
    # -----------------------------------------

    while cursor >= oldest_limit:
        window_result = (
            check_naver_conversion_history_window(
                cursor,
                probe_window_days,
                advertiser_id,
                token_payload,
            )
        )

        available_date = (
            window_result.get(
                "availableDate"
            )
        )

        tested_windows.append(
            {
                "baseDate":
                    cursor.isoformat(),

                "available":
                    bool(
                        window_result.get(
                            "available"
                        )
                    ),

                "availableDate":
                    (
                        available_date.isoformat()
                        if available_date
                        else None
                    ),

                "tested":
                    window_result.get(
                        "tested",
                        [],
                    ),
            }
        )

        if window_result.get(
            "available"
        ):
            if newest_available_date is None:
                newest_available_date = (
                    available_date
                )

            oldest_known_available_date = (
                available_date
            )

            cursor = (
                cursor
                - timedelta(
                    days=step_days
                )
            )

            continue

        # 아직 한 번도 available을
        # 찾지 못했다면 최근 집계 지연일 수 있으므로
        # 더 과거로 계속 탐색한다.
        if oldest_known_available_date is None:
            cursor = (
                cursor
                - timedelta(
                    days=step_days
                )
            )
            continue

        first_older_unavailable_date = (
            cursor
        )
        break

    # -----------------------------------------
    # 2. 사용 가능한 날짜를 하나도 못 찾음
    # -----------------------------------------

    if oldest_known_available_date is None:
        return {
            "status":
                "not_found",

            "advertiserId":
                advertiser_id,

            "earliestAvailableDate":
                None,

            "latestAvailableDate":
                None,

            "searchLimitReached":
                False,

            "testedWindows":
                tested_windows,
        }

    # -----------------------------------------
    # 3. lookback 끝까지 모두 available
    # -----------------------------------------

    if first_older_unavailable_date is None:
        return {
            "status":
                "ok",

            "advertiserId":
                advertiser_id,

            "earliestAvailableDate":
                oldest_limit.isoformat(),

            "latestAvailableDate":
                newest_available_date.isoformat(),

            "searchLimitReached":
                True,

            "testedWindows":
                tested_windows,
        }

    # -----------------------------------------
    # 4. coarse boundary 사이를 하루씩 검사
    # -----------------------------------------

    lower_date = max(
        first_older_unavailable_date,
        oldest_limit,
    )

    upper_date = (
        oldest_known_available_date
    )

    if lower_date > upper_date:
        lower_date, upper_date = (
            upper_date,
            lower_date,
        )

    earliest_available = None

    current_date = lower_date

    while current_date <= upper_date:
        result = (
            check_naver_conversion_history_window(
                current_date,
                1,
                advertiser_id,
                token_payload,
            )
        )

        if result.get("available"):
            earliest_available = (
                result.get(
                    "availableDate"
                )
            )
            break

        current_date += timedelta(
            days=1
        )

    if earliest_available is None:
        earliest_available = (
            oldest_known_available_date
        )

    return {
        "status":
            "ok",

        "advertiserId":
            advertiser_id,

        "earliestAvailableDate":
            earliest_available.isoformat(),

        "latestAvailableDate":
            newest_available_date.isoformat(),

        "searchLimitReached":
            False,

        "testedWindows":
            tested_windows,
    }


@app.post(
    "/ad-connections/naver/conversion-history-coverage"
)
def find_naver_conversion_history_coverage(
    payload: NaverHistoryCoveragePayload,
    token_payload=Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if (
        payload.maxLookbackDays < 30
        or payload.maxLookbackDays > 365
    ):
        return {
            "status": "error",
            "message":
                "maxLookbackDays는 30~365 사이여야 합니다.",
        }

    if (
        payload.stepDays < 3
        or payload.stepDays > 60
    ):
        return {
            "status": "error",
            "message":
                "stepDays는 3~60 사이여야 합니다.",
        }

    if (
        payload.probeWindowDays < 1
        or payload.probeWindowDays > 7
    ):
        return {
            "status": "error",
            "message":
                "probeWindowDays는 1~7 사이여야 합니다.",
        }

    if not payload.advertiserId:
        return {
            "status": "error",
            "message":
                "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "해당 광고주에 접근할 "
                    "권한이 없습니다."
                ),
            )

    finally:
        connection.close()

    result = (
        find_naver_conversion_history_coverage_internal(
            advertiser_id=
                payload.advertiserId,

            max_lookback_days=
                payload.maxLookbackDays,

            step_days=
                payload.stepDays,

            probe_window_days=
                payload.probeWindowDays,

            token_payload=
                token_payload,
        )
    )

    if result["status"] == "ok":
        result["message"] = (
            "Naver Conversion History의 "
            "사용 가능한 기간을 확인했습니다."
        )

    else:
        result["message"] = (
            "탐색 범위에서 생성 가능한 "
            "Conversion 리포트를 찾지 못했습니다."
        )

    return result

@app.post("/ad-connections/naver/history-coverage")
def find_naver_history_coverage(
    payload: NaverHistoryCoveragePayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]
    if payload.maxLookbackDays < 30 or payload.maxLookbackDays > 1500:
        return {
            "status": "error",
            "message": "maxLookbackDays는 30~1500 사이여야 합니다.",
        }

    if payload.stepDays < 7 or payload.stepDays > 90:
        return {
            "status": "error",
            "message": "stepDays는 7~90 사이여야 합니다.",
        }

    if payload.probeWindowDays < 1 or payload.probeWindowDays > 7:
        return {
            "status": "error",
            "message": "probeWindowDays는 1~7 사이여야 합니다.",
        }

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

    finally:
        connection.close()

    result = find_naver_history_coverage_internal(
        advertiser_id=payload.advertiserId,
        max_lookback_days=payload.maxLookbackDays,
        step_days=payload.stepDays,
        probe_window_days=payload.probeWindowDays,
        token_payload=token_payload,
    )

    if result["status"] == "ok":
        result["message"] = (
            "현재 계정의 Historical Backfill " "시작 후보일을 찾았습니다."
        )
    else:
        result["message"] = (
            "탐색 범위에서 생성 가능한 " "과거 보고서를 찾지 못했습니다."
        )

    return result


@app.post("/ad-connections/naver/backfill/start")
def start_naver_backfill(
    payload: NaverBackfillStartPayload,
    token_payload = Depends(
        require_operator
    ),
):
    # -----------------------------------------
    # 1. Operator JWT 검증
    # -----------------------------------------

    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 2. 광고주 ownership 검증
        # -----------------------------------------

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        # -----------------------------------------
        # 3. 현재 연결된 Naver 계정 확인
        # -----------------------------------------

        account_row = connection.execute(
            """
            SELECT
                account_id,
                customer_id,
                advertiser_id
            FROM ad_connections
            WHERE platform = ?
              AND status = ?
              AND advertiser_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                "connected",
                payload.advertiserId,
            ),
        ).fetchone()

        if account_row is None:
            return {
                "status": "not_connected",
                "advertiserId": payload.advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        account_id = (
            account_row["customer_id"]
            or account_row["account_id"]
        )

        if not account_id:
            return {
                "status": "account_missing",
                "advertiserId": payload.advertiserId,
                "message": "Naver Ads 계정 식별값을 확인할 수 없습니다.",
            }

        account_id = str(account_id)

        # -----------------------------------------
        # 4. Backfill 종료일 = 어제
        # -----------------------------------------

        yesterday = (
            datetime.now().date()
            - timedelta(days=1)
        )

        # -----------------------------------------
        # 5. 시작일 결정
        # -----------------------------------------

        if payload.startDate:
            try:
                target_start = datetime.strptime(
                    payload.startDate,
                    "%Y-%m-%d",
                ).date()

            except ValueError:
                return {
                    "status": "error",
                    "message": "startDate는 YYYY-MM-DD 형식이어야 합니다.",
                }

        else:
            coverage_result = find_naver_history_coverage_internal(
                advertiser_id=payload.advertiserId,
                max_lookback_days=730,
                step_days=30,
                probe_window_days=3,
                token_payload=token_payload,
            )

            if (
                coverage_result.get("status")
                != "ok"
            ):
                return {
                    "status": "coverage_failed",
                    "message": "Naver Historical Coverage를 확인하지 못했습니다.",
                    "detail": coverage_result,
                }

            earliest_available_date = (
                coverage_result.get(
                    "earliestAvailableDate"
                )
            )

            if not earliest_available_date:
                return {
                    "status": "coverage_not_found",
                    "message": "Backfill 시작 가능 날짜를 찾지 못했습니다.",
                }

            try:
                target_start = datetime.strptime(
                    earliest_available_date,
                    "%Y-%m-%d",
                ).date()

            except ValueError:
                return {
                    "status": "coverage_invalid",
                    "message": "탐색된 Historical 시작 날짜 형식이 올바르지 않습니다.",
                    "earliestAvailableDate":
                        earliest_available_date,
                }

        if target_start > yesterday:
            return {
                "status": "error",
                "message": "Backfill 시작일은 어제보다 늦을 수 없습니다.",
            }

        total_days = (
            yesterday - target_start
        ).days + 1

        now = datetime.now().isoformat()

        # -----------------------------------------
        # 6. 기존 계정 Job 확인
        # -----------------------------------------

        existing_job = connection.execute(
            """
            SELECT *
            FROM ad_backfill_jobs
            WHERE platform = ?
              AND account_id = ?
              AND advertiser_id = ?
            """,
            (
                "naver",
                account_id,
                payload.advertiserId,
            ),
        ).fetchone()

        # -----------------------------------------
        # 7. 기존 Job이 있으면 상태 확인
        # -----------------------------------------

        if existing_job:
            job_id = existing_job["id"]

            existing_total_days = int(
                existing_job["total_days"] or 0
            )

            existing_completed_days = int(
                existing_job["completed_days"] or 0
            )

            existing_failed_days = int(
                existing_job["failed_days"] or 0
            )

            existing_processed_days = (
                existing_completed_days
                + existing_failed_days
            )

            existing_is_completed = (
                existing_total_days > 0
                and existing_processed_days
                >= existing_total_days
                and existing_failed_days == 0
            )

            if existing_is_completed:
                return {
                    "status": "ok",
                    "advertiserId":
                        payload.advertiserId,
                    "message":
                        "선택한 광고주의 Historical Backfill은 이미 완료되어 있습니다.",
                    "existingJob": True,
                    "job": {
                        "id":
                            job_id,
                        "platform":
                            existing_job["platform"],
                        "advertiserId":
                            payload.advertiserId,
                        "accountId":
                            existing_job["account_id"],
                        "status":
                            "completed",
                        "targetStartDate":
                            existing_job[
                                "target_start_date"
                            ],
                        "targetEndDate":
                            existing_job[
                                "target_end_date"
                            ],
                        "totalDays":
                            existing_total_days,
                        "completedDays":
                            existing_completed_days,
                        "failedDays":
                            existing_failed_days,
                        "progress":
                            100,
                    },
                }

            return {
                "status": "ok",
                "advertiserId":
                    payload.advertiserId,
                "message":
                    "선택한 광고주의 기존 Historical Backfill Job을 계속 사용합니다.",
                "existingJob": True,
                "job": {
                    "id":
                        job_id,
                    "platform":
                        existing_job["platform"],
                    "advertiserId":
                        payload.advertiserId,
                    "accountId":
                        existing_job["account_id"],
                    "status":
                        existing_job["status"],
                    "targetStartDate":
                        existing_job[
                            "target_start_date"
                        ],
                    "targetEndDate":
                        existing_job[
                            "target_end_date"
                        ],
                    "currentDate":
                        existing_job[
                            "current_date"
                        ],
                    "totalDays":
                        existing_total_days,
                    "completedDays":
                        existing_completed_days,
                    "failedDays":
                        existing_failed_days,
                    "progress":
                        float(
                            existing_job[
                                "progress"
                            ]
                            or 0
                        ),
                },
            }

        # -----------------------------------------
        # 8. Job이 없으면 새로 생성
        # -----------------------------------------

        job_id = str(uuid.uuid4())

        connection.execute(
            """
            INSERT INTO ad_backfill_jobs (
                id,
                platform,
                account_id,
                advertiser_id,
                status,
                target_start_date,
                target_end_date,
                current_date,
                total_days,
                completed_days,
                failed_days,
                progress,
                last_error,
                created_at,
                started_at,
                updated_at,
                completed_at
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                NULL, ?, 0, 0, 0,
                NULL, ?, NULL, ?, NULL
            )
            """,
            (
                job_id,
                "naver",
                account_id,
                payload.advertiserId,
                "pending",
                target_start.isoformat(),
                yesterday.isoformat(),
                total_days,
                now,
                now,
            ),
        )

        connection.commit()

        return {
            "status": "ok",
            "advertiserId":
                payload.advertiserId,
            "message":
                "Naver Historical Backfill Job이 생성되었습니다.",
            "autoDetectedStartDate": (
                target_start.isoformat()
                if not payload.startDate
                else None
            ),
            "startDateMode": (
                "auto"
                if not payload.startDate
                else "manual"
            ),
            "job": {
                "id":
                    job_id,
                "platform":
                    "naver",
                "advertiserId":
                    payload.advertiserId,
                "accountId":
                    account_id,
                "status":
                    "pending",
                "targetStartDate":
                    target_start.isoformat(),
                "targetEndDate":
                    yesterday.isoformat(),
                "totalDays":
                    total_days,
                "completedDays":
                    0,
                "failedDays":
                    0,
                "progress":
                    0,
            },
        }

    finally:
        connection.close()


@app.post("/ad-connections/naver/backfill/process")
def process_naver_backfill(
    payload: NaverBackfillProcessPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    if payload.batchDays < 1 or payload.batchDays > 30:
        return {
            "status": "error",
            "message": "batchDays는 1~30 사이여야 합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        account_row = connection.execute(
            """
            SELECT
                account_id,
                customer_id,
                advertiser_id
            FROM ad_connections
            WHERE platform = ?
              AND status = ?
              AND advertiser_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                "connected",
                payload.advertiserId,
            ),
        ).fetchone()

        if account_row is None:
            return {
                "status": "not_connected",
                "advertiserId": payload.advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        account_id = account_row["customer_id"] or account_row["account_id"]

        if not account_id:
            return {
                "status": "account_missing",
                "message": "Naver Ads 계정 식별값을 확인할 수 없습니다.",
            }

        account_id = str(account_id)

        job = connection.execute(
            """
            SELECT *
            FROM ad_backfill_jobs
            WHERE platform = ?
              AND account_id = ?
              AND advertiser_id = ?
            LIMIT 1
            """,
            (
                "naver",
                account_id,
                payload.advertiserId,
            ),
        ).fetchone()

        if job is None:
            return {
                "status": "job_not_found",
                "message": "실행할 Historical Backfill Job이 없습니다.",
            }

        job_completed_days = int(job["completed_days"] or 0)

        job_failed_days = int(job["failed_days"] or 0)

        job_total_days = int(job["total_days"] or 0)

        job_processed_days = job_completed_days + job_failed_days

        truly_completed = (
            job_total_days > 0
            and job_processed_days >= job_total_days
            and job_failed_days == 0
        )

        if truly_completed:
            return {
                "status": "ok",
                "message": "Historical Backfill이 이미 완료되었습니다.",
                "jobId": job["id"],
                "jobStatus": "completed",
                "progress": 100,
            }

        target_start = datetime.strptime(
            job["target_start_date"],
            "%Y-%m-%d",
        ).date()

        target_end = datetime.strptime(
            job["target_end_date"],
            "%Y-%m-%d",
        ).date()

        completed_days = int(job["completed_days"] or 0)

        failed_days = int(job["failed_days"] or 0)

        processed_days = completed_days + failed_days

        # DB의 current_date가 과거 테스트 때문에
        # 잘못 저장되어 있을 수 있으므로,
        # 실제 처리 일수 기준으로 진행 위치를 복구한다.
        if processed_days > 0:
            recovered_current_date = target_start + timedelta(days=processed_days - 1)

            batch_start = recovered_current_date + timedelta(days=1)
        else:
            recovered_current_date = None
            batch_start = target_start

        if batch_start > target_end:
            truly_completed = (
                job["total_days"] > 0
                and processed_days >= int(job["total_days"])
                and failed_days == 0
            )

            if truly_completed:
                now = datetime.now().isoformat()

                connection.execute(
                    """
                    UPDATE ad_backfill_jobs
                    SET
                        status = ?,
                        progress = 100,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        "completed",
                        now,
                        now,
                        job["id"],
                    ),
                )

                connection.commit()

                return {
                    "status": "ok",
                    "message": "Historical Backfill이 완료되었습니다.",
                    "jobId": job["id"],
                    "jobStatus": "completed",
                    "progress": 100,
                }

            return {
                "status": "error",
                "message": "Backfill 진행 위치가 실제 완료 일수와 일치하지 않습니다.",
                "jobId": job["id"],
                "completedDays": completed_days,
                "failedDays": failed_days,
                "totalDays": int(job["total_days"]),
            }

        batch_end = batch_start + timedelta(days=payload.batchDays - 1)

        if batch_end > target_end:
            batch_end = target_end

        now = datetime.now().isoformat()

        connection.execute(
            """
            UPDATE ad_backfill_jobs
            SET
                status = ?,
                started_at =
                    COALESCE(started_at, ?),
                updated_at = ?,
                last_error = NULL
            WHERE id = ?
            """,
            (
                "running",
                now,
                now,
                job["id"],
            ),
        )

        connection.commit()

        job_id = job["id"]
        total_days = job["total_days"]

    finally:
        connection.close()

    try:
        successful_days = 0
        failed_days = 0
        total_saved = 0

        current_sync_date = batch_start

        while current_sync_date <= batch_end:
            sync_date_text = current_sync_date.isoformat()

            try:
                daily_payload = NaverDailyReportPayload(
                    date=sync_date_text,
                    advertiserId=payload.advertiserId,
                )

                daily_result = sync_naver_daily_performance(
                    daily_payload,
                    token_payload=token_payload,
                )

                if daily_result.get("status") == "ok":
                    successful_days += 1

                    total_saved += int(
                        daily_result.get(
                            "savedCount",
                            0,
                        )
                        or 0
                    )

                else:
                    failed_days += 1

                    failure_connection = get_db_connection()

                    try:
                        failure_now = datetime.now().isoformat()

                        error_message = (
                            daily_result.get("message")
                            or daily_result.get("detail")
                            or (
                                f"stage={daily_result.get('stage')}, "
                                f"httpStatus={daily_result.get('httpStatus')}, "
                                f"status={daily_result.get('status')}"
                            )
                        )

                        failure_connection.execute(
                            """
                            INSERT INTO
                                ad_backfill_failures (
                                    id,
                                    job_id,
                                    platform,
                                    account_id,
                                    failed_date,
                                    retry_count,
                                    status,
                                    error_message,
                                    created_at,
                                    updated_at,
                                    resolved_at
                                )
                            VALUES (
                                ?, ?, ?, ?, ?,
                                0, ?, ?, ?, ?, NULL
                            )
                            ON CONFLICT(
                                job_id,
                                failed_date
                            )
                            DO UPDATE SET
                                status = 'pending',
                                error_message =
                                    excluded.error_message,
                                updated_at =
                                    excluded.updated_at,
                                resolved_at = NULL
                            """,
                            (
                                str(uuid.uuid4()),
                                job_id,
                                "naver",
                                account_id,
                                sync_date_text,
                                "pending",
                                error_message,
                                failure_now,
                                failure_now,
                            ),
                        )

                        failure_connection.commit()

                    finally:
                        failure_connection.close()

            except Exception as daily_error:
                failed_days += 1

                failure_connection = get_db_connection()

                try:
                    failure_now = datetime.now().isoformat()

                    failure_connection.execute(
                        """
                        INSERT INTO
                            ad_backfill_failures (
                                id,
                                job_id,
                                platform,
                                account_id,
                                failed_date,
                                retry_count,
                                status,
                                error_message,
                                created_at,
                                updated_at,
                                resolved_at
                            )
                        VALUES (
                            ?, ?, ?, ?, ?,
                            0, ?, ?, ?, ?, NULL
                        )
                        ON CONFLICT(
                            job_id,
                            failed_date
                        )
                        DO UPDATE SET
                            status = 'pending',
                            error_message =
                                excluded.error_message,
                            updated_at =
                                excluded.updated_at,
                            resolved_at = NULL
                        """,
                        (
                            str(uuid.uuid4()),
                            job_id,
                            "naver",
                            account_id,
                            sync_date_text,
                            "pending",
                            str(daily_error),
                            failure_now,
                            failure_now,
                        ),
                    )

                    failure_connection.commit()

                finally:
                    failure_connection.close()

            current_sync_date += timedelta(days=1)

        processed_days = (batch_end - batch_start).days + 1

        connection = get_db_connection()

        try:
            refreshed_job = connection.execute(
                """
                    SELECT *
                    FROM ad_backfill_jobs
                    WHERE id = ?
                    """,
                (job_id,),
            ).fetchone()

            old_completed = int(refreshed_job["completed_days"] or 0)

            old_failed = int(refreshed_job["failed_days"] or 0)

            new_completed = old_completed + successful_days

            new_failed = old_failed + failed_days

            processed_total = new_completed + new_failed

            progress = processed_total / total_days * 100 if total_days > 0 else 0

            if progress > 100:
                progress = 100

            is_last_batch = batch_end >= target_end

            if is_last_batch and new_failed == 0:
                job_status = "completed"
                progress = 100
                completed_at = datetime.now().isoformat()

            elif is_last_batch and new_failed > 0:
                job_status = "retry_pending"
                completed_at = None

            else:
                job_status = "running"
                completed_at = None

            updated_at = datetime.now().isoformat()

            connection.execute(
                """
                UPDATE ad_backfill_jobs
                SET
                    status = ?,
                    current_date = ?,
                    completed_days = ?,
                    failed_days = ?,
                    progress = ?,
                    last_error = NULL,
                    updated_at = ?,
                    completed_at = ?
                WHERE id = ?
                """,
                (
                    job_status,
                    batch_end.isoformat(),
                    new_completed,
                    new_failed,
                    progress,
                    updated_at,
                    completed_at,
                    job_id,
                ),
            )

            connection.commit()

        finally:
            connection.close()

        return {
            "status": "ok",
            "advertiserId": payload.advertiserId,
            "jobId": job_id,
            "jobStatus": job_status,
            "batchSince": batch_start.isoformat(),
            "batchUntil": batch_end.isoformat(),
            "batchDays": processed_days,
            "successfulDays": successful_days,
            "failedDays": failed_days,
            "completedDays": new_completed,
            "totalDays": total_days,
            "progress": round(progress, 2),
            "savedCount": total_saved,
        }

    except Exception as error:
        connection = get_db_connection()

        try:
            now = datetime.now().isoformat()

            connection.execute(
                """
                UPDATE ad_backfill_jobs
                SET
                    status = ?,
                    last_error = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    "failed",
                    str(error),
                    now,
                    job_id,
                ),
            )

            connection.commit()

        finally:
            connection.close()

        return {
            "status": "error",
            "jobId": job_id,
            "jobStatus": "failed",
            "message": str(error),
        }


@app.get("/ad-connections/naver/backfill/status")
def get_naver_backfill_status(
    advertiserId: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
            "hasJob": False,
        }

    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 2. 광고주 ownership 검증
        # -----------------------------------------

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        # -----------------------------------------
        # 3. 현재 광고주의 Naver 연결 계정 확인
        # -----------------------------------------

        account_row = connection.execute(
            """
            SELECT
                account_id,
                customer_id,
                advertiser_id
            FROM ad_connections
            WHERE platform = ?
              AND status = ?
              AND advertiser_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                "connected",
                advertiserId,
            ),
        ).fetchone()

        if account_row is None:
            return {
                "status": "not_connected",
                "advertiserId": advertiserId,
                "hasJob": False,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        account_id = (
            account_row["customer_id"]
            or account_row["account_id"]
        )

        if not account_id:
            return {
                "status": "account_missing",
                "advertiserId": advertiserId,
                "hasJob": False,
                "message": "Naver Ads 계정 식별값을 확인할 수 없습니다.",
            }

        account_id = str(account_id)

        # -----------------------------------------
        # 4. Backfill Job 조회
        # -----------------------------------------

        job = connection.execute(
            """
            SELECT *
            FROM ad_backfill_jobs
            WHERE platform = ?
              AND account_id = ?
              AND advertiser_id = ?
            LIMIT 1
            """,
            (
                "naver",
                account_id,
                advertiserId,
            ),
        ).fetchone()

        if job is None:
            return {
                "status": "ok",
                "advertiserId": advertiserId,
                "hasJob": False,
                "accountId": account_id,
                "job": None,
            }

        total_days = int(
            job["total_days"] or 0
        )

        completed_days = int(
            job["completed_days"] or 0
        )

        failed_days = int(
            job["failed_days"] or 0
        )

        processed_days = (
            completed_days
            + failed_days
        )

        remaining_days = max(
            total_days - processed_days,
            0,
        )

        calculated_progress = (
            processed_days
            / total_days
            * 100
            if total_days > 0
            else 0
        )

        calculated_progress = min(
            calculated_progress,
            100,
        )

        if (
            processed_days >= total_days
            and failed_days == 0
        ):
            calculated_status = "completed"

        elif (
            processed_days >= total_days
            and failed_days > 0
        ):
            calculated_status = (
                "retry_pending"
            )

        else:
            calculated_status = "running"

        # -----------------------------------------
        # 5. 실패 샘플 조회
        # -----------------------------------------

        failure_rows = connection.execute(
            """
            SELECT
                failed_date,
                retry_count,
                status,
                error_message
            FROM ad_backfill_failures
            WHERE job_id = ?
            ORDER BY failed_date ASC
            LIMIT 5
            """,
            (
                job["id"],
            ),
        ).fetchall()

        failure_samples = [
            {
                "failedDate":
                    row["failed_date"],
                "retryCount":
                    row["retry_count"],
                "status":
                    row["status"],
                "errorMessage":
                    row["error_message"],
            }
            for row in failure_rows
        ]

        return {
            "status": "ok",
            "advertiserId": advertiserId,
            "hasJob": True,
            "accountId": account_id,
            "job": {
                "id":
                    job["id"],
                "platform":
                    job["platform"],
                "accountId":
                    job["account_id"],
                "advertiserId":
                    job["advertiser_id"],
                "status":
                    calculated_status,
                "targetStartDate":
                    job["target_start_date"],
                "targetEndDate":
                    job["target_end_date"],
                "currentDate":
                    job["current_date"],
                "totalDays":
                    total_days,
                "completedDays":
                    completed_days,
                "failedDays":
                    failed_days,
                "processedDays":
                    processed_days,
                "remainingDays":
                    remaining_days,
                "progress":
                    round(
                        calculated_progress,
                        2,
                    ),
                "lastError":
                    job["last_error"],
                "createdAt":
                    job["created_at"],
                "startedAt":
                    job["started_at"],
                "updatedAt":
                    job["updated_at"],
                "completedAt":
                    job["completed_at"],
            },
            "failureSamples":
                failure_samples,
        }

    finally:
        connection.close()


@app.post("/ad-connections/naver/backfill/retry")
def retry_naver_backfill_failures(
    payload: NaverBackfillRetryPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    if payload.maxRetries < 1 or payload.maxRetries > 10:
        return {
            "status": "error",
            "message": "maxRetries는 1~10 사이여야 합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        account_row = connection.execute(
            """
            SELECT
                account_id,
                customer_id,
                advertiser_id
            FROM ad_connections
            WHERE platform = ?
              AND status = ?
              AND advertiser_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (
                "naver",
                "connected",
                payload.advertiserId,
            ),
        ).fetchone()

        if account_row is None:
            return {
                "status": "not_connected",
                "advertiserId": payload.advertiserId,
                "message": "선택한 광고주에 연결된 Naver Ads 계정이 없습니다.",
            }

        account_id = account_row["customer_id"] or account_row["account_id"]

        if not account_id:
            return {
                "status": "account_missing",
                "advertiserId": payload.advertiserId,
                "message": "선택한 광고주의 Naver Ads 계정 식별값을 확인할 수 없습니다.",
            }

        account_id = str(account_id)

        job = connection.execute(
            """
            SELECT *
            FROM ad_backfill_jobs
            WHERE platform = ?
              AND account_id = ?
              AND advertiser_id = ?
            LIMIT 1
            """,
            (
                "naver",
                account_id,
                payload.advertiserId,
            ),
        ).fetchone()

        if job is None:
            return {
                "status": "job_not_found",
                "advertiserId": payload.advertiserId,
                "message": "선택한 광고주의 Historical Backfill Job이 없습니다.",
            }

        job_id = job["id"]

        failures = connection.execute(
            """
            SELECT *
            FROM ad_backfill_failures
            WHERE job_id = ?
              AND status = ?
              AND retry_count < ?
            ORDER BY failed_date ASC
            """,
            (
                job_id,
                "pending",
                payload.maxRetries,
            ),
        ).fetchall()

    finally:
        connection.close()

    if not failures:
        connection = get_db_connection()

        try:
            pending_count = connection.execute(
                """
                SELECT COUNT(*) AS count
                FROM ad_backfill_failures
                WHERE job_id = ?
                  AND status = ?
                """,
                (
                    job_id,
                    "pending",
                ),
            ).fetchone()["count"]

            current_date = (
                datetime.strptime(
                    job["current_date"],
                    "%Y-%m-%d",
                ).date()
                if job["current_date"]
                else None
            )

            target_end = datetime.strptime(
                job["target_end_date"],
                "%Y-%m-%d",
            ).date()

            main_backfill_finished = (
                current_date is not None and current_date >= target_end
            )

            if pending_count == 0 and main_backfill_finished:
                now = datetime.now().isoformat()

                connection.execute(
                    """
                    UPDATE ad_backfill_jobs
                    SET
                        status = ?,
                        progress = 100,
                        failed_days = 0,
                        completed_at = ?,
                        updated_at = ?,
                        last_error = NULL
                    WHERE id = ?
                    """,
                    (
                        "completed",
                        now,
                        now,
                        job_id,
                    ),
                )

                connection.commit()

                return {
                    "status": "ok",
                    "advertiserId": payload.advertiserId,
                    "jobId": job_id,
                    "jobStatus": "completed",
                    "retriedDays": 0,
                    "resolvedDays": 0,
                    "failedDays": 0,
                    "remainingFailures": 0,
                    "message": "Historical Backfill이 완료되었습니다.",
                }

            if not main_backfill_finished:
                return {
                    "status": "ok",
                    "advertiserId": payload.advertiserId,
                    "jobId": job_id,
                    "jobStatus": job["status"],
                    "retriedDays": 0,
                    "resolvedDays": 0,
                    "failedDays": 0,
                    "remainingFailures": pending_count,
                    "message": "Historical Backfill 본 작업이 아직 진행 중입니다.",
                }

            return {
                "status": "ok",
                "advertiserId": payload.advertiserId,
                "jobId": job_id,
                "jobStatus": "retry_pending",
                "retriedDays": 0,
                "resolvedDays": 0,
                "failedDays": 0,
                "remainingFailures": pending_count,
                "message": "최대 재시도 횟수에 도달한 실패 날짜가 있습니다.",
            }

        finally:
            connection.close()

    retried_days = 0
    resolved_days = 0
    failed_days = 0

    for failure in failures:
        failure_id = failure["id"]
        failed_date = failure["failed_date"]

        retried_days += 1

        try:
            daily_payload = NaverDailyReportPayload(
                date=failed_date,
                advertiserId=payload.advertiserId,
            )

            daily_result = sync_naver_daily_performance(
                    daily_payload,
                    token_payload=token_payload,
                )

            connection = get_db_connection()

            try:
                now = datetime.now().isoformat()

                if daily_result.get("status") == "ok":
                    resolved_days += 1

                    connection.execute(
                        """
                        UPDATE ad_backfill_failures
                        SET
                            status = ?,
                            retry_count =
                                retry_count + 1,
                            error_message = NULL,
                            updated_at = ?,
                            resolved_at = ?
                        WHERE id = ?
                        """,
                        (
                            "resolved",
                            now,
                            now,
                            failure_id,
                        ),
                    )

                else:
                    failed_days += 1

                    error_message = (
                        daily_result.get("message") or "Naver daily retry failed."
                    )

                    connection.execute(
                        """
                        UPDATE ad_backfill_failures
                        SET
                            retry_count =
                                retry_count + 1,
                            status = ?,
                            error_message = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            "pending",
                            error_message,
                            now,
                            failure_id,
                        ),
                    )

                connection.commit()

            finally:
                connection.close()

        except Exception as retry_error:
            failed_days += 1

            connection = get_db_connection()

            try:
                now = datetime.now().isoformat()

                connection.execute(
                    """
                    UPDATE ad_backfill_failures
                    SET
                        retry_count =
                            retry_count + 1,
                        status = ?,
                        error_message = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        "pending",
                        str(retry_error),
                        now,
                        failure_id,
                    ),
                )

                connection.commit()

            finally:
                connection.close()

    connection = get_db_connection()

    try:
        pending_row = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM ad_backfill_failures
            WHERE job_id = ?
              AND status = ?
            """,
            (
                job_id,
                "pending",
            ),
        ).fetchone()

        remaining_failures = int(pending_row["count"] or 0)

        now = datetime.now().isoformat()

        updated_completed_days = min(
            int(job["completed_days"] or 0) + resolved_days,
            int(job["total_days"] or 0),
        )

        current_date = (
            datetime.strptime(
                job["current_date"],
                "%Y-%m-%d",
            ).date()
            if job["current_date"]
            else None
        )

        target_end = datetime.strptime(
            job["target_end_date"],
            "%Y-%m-%d",
        ).date()

        main_backfill_finished = current_date is not None and current_date >= target_end

        if remaining_failures == 0 and main_backfill_finished:
            job_status = "completed"

            connection.execute(
                """
                UPDATE ad_backfill_jobs
                SET
                    status = ?,
                    progress = 100,
                    completed_days = ?,
                    failed_days = 0,
                    completed_at = ?,
                    updated_at = ?,
                    last_error = NULL
                WHERE id = ?
                """,
                (
                    "completed",
                    updated_completed_days,
                    now,
                    now,
                    job_id,
                ),
            )

        else:
            if main_backfill_finished:
                job_status = "retry_pending"
            else:
                job_status = "running"

            connection.execute(
                """
                UPDATE ad_backfill_jobs
                SET
                    status = ?,
                    completed_days = ?,
                    failed_days = ?,
                    completed_at = NULL,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    job_status,
                    updated_completed_days,
                    remaining_failures,
                    now,
                    job_id,
                ),
            )

        connection.commit()

    finally:
        connection.close()

    return {
        "status": "ok",
        "advertiserId": payload.advertiserId,
        "jobId": job_id,
        "jobStatus": job_status,
        "retriedDays": retried_days,
        "resolvedDays": resolved_days,
        "failedDays": failed_days,
        "remainingFailures": remaining_failures,
    }


@app.post("/ad-connections")
def create_ad_connection(
    payload: AdConnectionPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        raise HTTPException(
            status_code=400,
            detail="advertiserId가 필요합니다.",
        )

    operator_id = token_payload.get("sub")

    if not operator_id:
        return {
            "status": "unauthorized",
            "message": "운영자 정보를 확인할 수 없습니다.",
        }

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        existing_connection = None

        if payload.accountId:
            existing_connection = connection.execute(
                """
                SELECT *
                FROM ad_connections
                WHERE advertiser_id = ?
                  AND platform = ?
                  AND account_id = ?
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (
                    payload.advertiserId,
                    payload.platform,
                    payload.accountId,
                ),
            ).fetchone()

        if existing_connection is not None:
            connection_id = existing_connection["id"]

            connection.execute(
                """
                UPDATE ad_connections
                SET
                    advertiser_id = ?,
                    platform = ?,
                    api_url = ?,
                    account_id = ?,
                    account_name = ?,
                    status = ?,
                    access_token = ?,
                    refresh_token = ?,
                    secret_key = ?,
                    customer_id = ?,
                    token_expires_at = ?,
                    last_synced_at = ?,
                    updated_at = ?
                WHERE id = ?
                  AND advertiser_id = ?
                """,
                (
                    payload.advertiserId,
                    payload.platform,
                    payload.apiUrl,
                    payload.accountId,
                    payload.accountName,
                    payload.status,
                    payload.accessToken,
                    payload.refreshToken,
                    payload.secretKey,
                    payload.customerId,
                    payload.tokenExpiresAt,
                    payload.lastSyncedAt,
                    payload.updatedAt,
                    connection_id,
                    payload.advertiserId,
                ),
            )

            result_status = "updated"

        else:
            connection_id = payload.id

            connection.execute(
                """
                INSERT INTO ad_connections (
                    id,
                    advertiser_id,
                    platform,
                    api_url,
                    account_id,
                    account_name,
                    status,
                    access_token,
                    refresh_token,
                    secret_key,
                    customer_id,
                    token_expires_at,
                    last_synced_at,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    connection_id,
                    payload.advertiserId,
                    payload.platform,
                    payload.apiUrl,
                    payload.accountId,
                    payload.accountName,
                    payload.status,
                    payload.accessToken,
                    payload.refreshToken,
                    payload.secretKey,
                    payload.customerId,
                    payload.tokenExpiresAt,
                    payload.lastSyncedAt,
                    payload.createdAt,
                    payload.updatedAt,
                ),
            )

            result_status = "created"

        connection.commit()

        return {
            "status": result_status,
            "connection": {
                "id": connection_id,
                "advertiserId": payload.advertiserId,
                "platform": payload.platform,
                "apiUrl": payload.apiUrl,
                "accountId": payload.accountId,
                "accountName": payload.accountName,
                "status": payload.status,
                "tokenExpiresAt": payload.tokenExpiresAt,
                "lastSyncedAt": payload.lastSyncedAt,
                "createdAt": (
                    existing_connection["created_at"]
                    if existing_connection is not None
                    else payload.createdAt
                ),
                "updatedAt": payload.updatedAt,
            },
        }

    finally:
        connection.close()


@app.patch("/ad-connections/{connection_id}/disconnect")
def disconnect_ad_connection(
    connection_id: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    connection = get_db_connection()

    try:
        row = connection.execute(
            """
            SELECT
                id,
                advertiser_id
            FROM ad_connections
            WHERE id = ?
            LIMIT 1
            """,
            (
                connection_id,
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_found",
                "message": "연결된 광고 계정을 찾을 수 없습니다.",
            }

        advertiser_id = row["advertiser_id"]

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiser_id,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        updated_at = (
            datetime.utcnow().isoformat()
            + "Z"
        )

        connection.execute(
            """
            UPDATE ad_connections
            SET
                status = ?,
                access_token = NULL,
                refresh_token = NULL,
                secret_key = NULL,
                customer_id = NULL,
                token_expires_at = NULL,
                updated_at = ?
            WHERE id = ?
              AND advertiser_id = ?
            """,
            (
                "disconnected",
                updated_at,
                connection_id,
                advertiser_id,
            ),
        )

        connection.commit()

        return {
            "status": "disconnected",
            "connectionId": connection_id,
            "advertiserId": advertiser_id,
            "updatedAt": updated_at,
        }

    finally:
        connection.close()


@app.post("/client-proposals/{proposal_id}/share")
def create_client_proposal_share(
    proposal_id: str,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    operator_id = token_payload.get("sub")

    if not operator_id:
        return {
            "status": "unauthorized",
            "message": "운영자 정보를 확인할 수 없습니다.",
        }

    connection = get_db_connection()

    try:
        row = connection.execute(
            """
            SELECT
                advertiser_id,
                proposal_json
            FROM client_proposals
            WHERE id = ?
            LIMIT 1
            """,
            (
                proposal_id,
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_found",
                "message": "광고주 제안을 찾을 수 없습니다.",
            }

        advertiser_id = row["advertiser_id"]

        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
              AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                advertiser_id,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail="해당 광고주에 접근할 권한이 없습니다.",
            )

        proposal_data = json.loads(
            row["proposal_json"]
        )

        # 이미 생성된 링크가 있다면 재사용
        if proposal_data.get("shareToken") and proposal_data.get("shareUrl"):
            return {
                "status": "already_shared",
                "shareToken": proposal_data["shareToken"],
                "shareUrl": proposal_data["shareUrl"],
            }

        share_token = secrets.token_urlsafe(32)

        share_url = "http://localhost:5173" f"/client/proposal/{share_token}"

        shared_at = __import__("datetime").datetime.utcnow().isoformat() + "Z"

        proposal_data["shareToken"] = share_token

        proposal_data["shareUrl"] = share_url

        proposal_data["shareStatus"] = "shared"

        proposal_data["sharedAt"] = shared_at

        proposal_data["updatedAt"] = shared_at

        connection.execute(
            """
            UPDATE client_proposals
            SET
                share_token = ?,
                share_url = ?,
                share_status = ?,
                shared_at = ?,
                updated_at = ?,
                proposal_json = ?
            WHERE id = ?
            """,
            (
                share_token,
                share_url,
                "shared",
                shared_at,
                shared_at,
                json.dumps(
                    proposal_data,
                    ensure_ascii=False,
                ),
                proposal_id,
            ),
        )

        connection.commit()

        return {
            "status": "shared",
            "shareToken": share_token,
            "shareUrl": share_url,
            "sharedAt": shared_at,
        }

    finally:
        connection.close()


@app.get("/shared/client-proposals/{share_token}")
def get_shared_client_proposal(share_token: str):
    connection = get_db_connection()

    try:
        row = connection.execute(
            """
            SELECT
                advertiser_id,
                share_status,
                proposal_json
            FROM client_proposals
            WHERE share_token = ?
            LIMIT 1
            """,
            (
                share_token,
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_found",
                "message": "공유된 제안을 찾을 수 없습니다.",
            }
        if row["share_status"] not in {
            "shared",
            "sent",
        }:
            return {
                "status": "not_shared",
                "message": "현재 공유되지 않은 제안입니다.",
            }

        if not row["advertiser_id"]:
            return {
                "status": "invalid_proposal",
                "message": "광고주 정보가 연결되지 않은 제안입니다.",
            }

        proposal_data = json.loads(row["proposal_json"])

        if proposal_data.get("status") == "cancelled":
            return {
                "status": "cancelled",
                "message": "취소된 제안입니다.",
            }

        public_proposal = {
            "id": proposal_data.get("id"),
            "scenarioName": proposal_data.get("scenarioName"),
            "status": proposal_data.get("status"),
            "totalBudget": proposal_data.get("totalBudget"),
            "summary": proposal_data.get("summary"),
            "allocations": proposal_data.get(
                "allocations",
                [],
            ),
            "sharedAt": proposal_data.get("sharedAt"),
            "firstViewedAt": proposal_data.get("firstViewedAt"),
            "lastViewedAt": proposal_data.get("lastViewedAt"),
            "viewCount": proposal_data.get(
                "viewCount",
                0,
            ),
        }

        return {
            "status": "ok",
            "proposal": public_proposal,
        }

    finally:
        connection.close()


@app.post("/shared/client-proposals/{share_token}/view")
def mark_shared_client_proposal_viewed(
    share_token: str,
):
    connection = get_db_connection()

    try:
        row = connection.execute(
            """
            SELECT
                id,
                advertiser_id,
                share_status,
                proposal_json
            FROM client_proposals
            WHERE share_token = ?
            LIMIT 1
            """,
            (
                share_token,
            ),
        ).fetchone()

        # -----------------------------------------
        # 1. 공유 토큰 존재 여부
        # -----------------------------------------
        if row is None:
            return {
                "status": "not_found",
                "message": "공유된 제안을 찾을 수 없습니다.",
            }

        # -----------------------------------------
        # 2. 실제 공유 상태인지 확인
        # -----------------------------------------
        if row["share_status"] not in {
            "shared",
            "sent",
        }:
            return {
                "status": "not_shared",
                "message": "현재 공유되지 않은 제안입니다.",
            }

        # -----------------------------------------
        # 3. 광고주 연결 확인
        # -----------------------------------------
        if not row["advertiser_id"]:
            return {
                "status": "invalid_proposal",
                "message": "광고주 정보가 연결되지 않은 제안입니다.",
            }

        proposal_data = json.loads(
            row["proposal_json"]
        )

        # -----------------------------------------
        # 4. 취소된 제안 차단
        # -----------------------------------------
        if (
            proposal_data.get("status")
            == "cancelled"
        ):
            return {
                "status": "cancelled",
                "message": "취소된 제안입니다.",
            }

        viewed_at = (
            datetime.now(
                timezone.utc
            ).isoformat()
        )

        first_viewed_at = (
            proposal_data.get(
                "firstViewedAt"
            )
        )

        current_view_count = (
            proposal_data.get(
                "viewCount",
                0,
            )
            or 0
        )

        is_first_view = (
            not first_viewed_at
        )

        # -----------------------------------------
        # 5. 최초 열람 처리
        # -----------------------------------------
        if is_first_view:
            proposal_data[
                "firstViewedAt"
            ] = viewed_at

            proposal_data[
                "status"
            ] = "reviewing"

        # -----------------------------------------
        # 6. 최근 열람 / 조회수 처리
        # -----------------------------------------
        proposal_data[
            "lastViewedAt"
        ] = viewed_at

        proposal_data[
            "viewCount"
        ] = (
            current_view_count + 1
        )

        proposal_data[
            "updatedAt"
        ] = viewed_at

        connection.execute(
            """
            UPDATE client_proposals
            SET
                status = ?,
                first_viewed_at = ?,
                last_viewed_at = ?,
                view_count = ?,
                updated_at = ?,
                proposal_json = ?
            WHERE id = ?
            """,
            (
                proposal_data.get(
                    "status"
                ),
                proposal_data.get(
                    "firstViewedAt"
                ),
                viewed_at,
                proposal_data[
                    "viewCount"
                ],
                viewed_at,
                json.dumps(
                    proposal_data,
                    ensure_ascii=False,
                ),
                row["id"],
            ),
        )

        # -----------------------------------------
        # 7. 최초 열람 Event 생성
        # -----------------------------------------
        if is_first_view:
            event_id = (
                "event_viewed_"
                + secrets.token_hex(8)
            )

            connection.execute(
                """
                INSERT INTO proposal_events (
                    id,
                    proposal_id,
                    event_type,
                    status,
                    message,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    row["id"],
                    "viewed",
                    "reviewing",
                    "광고주가 제안을 최초 열람했습니다.",
                    viewed_at,
                ),
            )

        connection.commit()

        return {
            "status": "viewed",
            "firstView":
                is_first_view,
            "firstViewedAt":
                proposal_data.get(
                    "firstViewedAt"
                ),
            "lastViewedAt":
                viewed_at,
            "viewCount":
                proposal_data[
                    "viewCount"
                ],
            "proposalStatus":
                proposal_data.get(
                    "status"
                ),
        }

    finally:
        connection.close()


@app.post("/shared/client-proposals/{share_token}/action")
def handle_shared_proposal_action(
    share_token: str,
    payload: SharedProposalActionPayload,
):
    connection = get_db_connection()

    try:
        row = connection.execute(
            """
            SELECT
                id,
                advertiser_id,
                share_status,
                proposal_json
            FROM client_proposals
            WHERE share_token = ?
            LIMIT 1
            """,
            (
                share_token,
            ),
        ).fetchone()

        if row is None:
            return {
                "status": "not_found",
                "message": "공유된 제안을 찾을 수 없습니다.",
            }

        if row["share_status"] not in {
            "shared",
            "sent",
        }:
            return {
                "status": "not_shared",
                "message": "현재 공유되지 않은 제안입니다.",
            }

        if not row["advertiser_id"]:
            return {
                "status": "invalid_proposal",
                "message": "광고주 정보가 연결되지 않은 제안입니다.",
            }

        proposal_data = json.loads(
            row["proposal_json"]
        )

        current_status = proposal_data.get(
            "status"
        )

        if current_status == "cancelled":
            return {
                "status": "cancelled",
                "message": "취소된 제안입니다.",
            }

        if current_status == "approved":
            return {
                "status": "already_approved",
                "message": "이미 승인된 제안입니다.",
            }

        changed_at = (
            datetime.now(
                timezone.utc
            ).isoformat()
        )

        if payload.action == "revision_requested":
            next_status = "revision_requested"

            event_message = (
                payload.message
                or "광고주가 수정 요청을 등록했습니다."
            )

            proposal_data["revisionReason"] = (
                payload.message or ""
            )

            proposal_data["taskStatus"] = (
                "waiting"
            )

        elif payload.action == "approved":
            next_status = "approved"

            event_message = (
                payload.message
                or "광고주가 제안을 승인했습니다."
            )

            proposal_data["taskStatus"] = (
                "done"
            )

        else:
            return {
                "status": "invalid_action",
                "message": "지원하지 않는 광고주 액션입니다.",
            }

        proposal_data["status"] = (
            next_status
        )

        proposal_data["updatedAt"] = (
            changed_at
        )

        connection.execute(
            """
            UPDATE client_proposals
            SET
                status = ?,
                task_status = ?,
                updated_at = ?,
                proposal_json = ?
            WHERE id = ?
            """,
            (
                next_status,
                proposal_data.get(
                    "taskStatus",
                    "waiting",
                ),
                changed_at,
                json.dumps(
                    proposal_data,
                    ensure_ascii=False,
                ),
                row["id"],
            ),
        )

        event_id = (
            "event_"
            + payload.action
            + "_"
            + secrets.token_hex(8)
        )

        connection.execute(
            """
            INSERT INTO proposal_events (
                id,
                proposal_id,
                event_type,
                status,
                message,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                row["id"],
                payload.action,
                next_status,
                event_message,
                changed_at,
            ),
        )

        connection.commit()

        return {
            "status": "ok",
            "advertiserId":
                row["advertiser_id"],
            "proposalStatus":
                next_status,
        }

    finally:
        connection.close()


@app.post("/client-proposals/{proposal_id}/messages")
def create_proposal_message(
    proposal_id: str,
    payload: ProposalMessagePayload,
    advertiserId: str | None = None,
    clientId: str | None = None,
    token_payload = Depends(
        require_authenticated_user
    ),
):
    role = token_payload.get(
        "role"
    )

    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 1. Operator 메시지
        # -----------------------------------------
        if payload.senderType == "internal":
            if role != "operator":
                raise HTTPException(
                    status_code=403,
                    detail="운영자 권한이 필요합니다.",
                )

            operator_id = token_payload[
                "sub"
            ]

            if not advertiserId:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "내부 운영자 요청에는 advertiserId가 필요합니다.",
                )

            advertiser = connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    advertiserId,
                    operator_id,
                ),
            ).fetchone()

            if advertiser is None:
                raise HTTPException(
                    status_code=403,
                    detail=
                        "해당 광고주에 접근할 권한이 없습니다.",
                )

            existing_proposal = connection.execute(
                """
                SELECT
                    id,
                    advertiser_id,
                    client_id
                FROM client_proposals
                WHERE id = ?
                  AND advertiser_id = ?
                LIMIT 1
                """,
                (
                    proposal_id,
                    advertiserId,
                ),
            ).fetchone()

            if existing_proposal is None:
                return {
                    "status": "not_found",
                    "advertiserId":
                        advertiserId,
                    "message":
                        "선택한 광고주의 제안을 찾을 수 없습니다.",
                }

        # -----------------------------------------
        # 2. Client 메시지
        # -----------------------------------------
        elif payload.senderType == "client":
            if role != "client":
                raise HTTPException(
                    status_code=403,
                    detail="Client 권한이 필요합니다.",
                )

            client_id = token_payload[
                "clientId"
            ]

            user_id = token_payload[
                "sub"
            ]

            client_row = connection.execute(
                """
                SELECT
                    id,
                    client_id,
                    advertiser_id
                FROM client_users
                WHERE id = ?
                  AND client_id = ?
                LIMIT 1
                """,
                (
                    user_id,
                    client_id,
                ),
            ).fetchone()

            if client_row is None:
                return {
                    "status": "not_found",
                    "message":
                        "클라이언트 정보를 찾을 수 없습니다.",
                }

            client_advertiser_id = (
                client_row[
                    "advertiser_id"
                ]
            )

            if not client_advertiser_id:
                return {
                    "status": "error",
                    "message":
                        "클라이언트에 연결된 광고주가 없습니다.",
                }

            existing_proposal = connection.execute(
                """
                SELECT
                    id,
                    advertiser_id,
                    client_id
                FROM client_proposals
                WHERE id = ?
                  AND client_id = ?
                  AND advertiser_id = ?
                LIMIT 1
                """,
                (
                    proposal_id,
                    client_id,
                    client_advertiser_id,
                ),
            ).fetchone()

            if existing_proposal is None:
                return {
                    "status": "not_found",
                    "message":
                        "해당 클라이언트의 제안을 찾을 수 없습니다.",
                }

        # -----------------------------------------
        # 3. 잘못된 senderType
        # -----------------------------------------
        else:
            raise HTTPException(
                status_code=400,
                detail=
                    "senderType은 client 또는 internal이어야 합니다.",
            )

        # -----------------------------------------
        # 4. 메시지 저장
        # -----------------------------------------
        connection.execute(
            """
            INSERT INTO proposal_messages (
                id,
                proposal_id,
                sender_type,
                sender_name,
                message,
                action_url,
                action_label,
                is_read,
                read_at,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.id,
                proposal_id,
                payload.senderType,
                payload.senderName,
                payload.message,
                payload.actionUrl,
                payload.actionLabel,
                1 if payload.isRead else 0,
                payload.readAt,
                payload.createdAt,
            ),
        )

        connection.commit()

        return {
            "status": "saved",
            "advertiserId":
                existing_proposal[
                    "advertiser_id"
                ],
            "clientId":
                existing_proposal[
                    "client_id"
                ],
            "message":
                payload.model_dump(),
        }

    finally:
        connection.close()


@app.get("/client-proposals/{proposal_id}/messages")
def get_proposal_messages(
    proposal_id: str,
    advertiserId: str | None = None,
    clientId: str | None = None,
    token_payload = Depends(
        require_authenticated_user
    ),
):
    role = token_payload.get(
        "role"
    )

    connection = get_db_connection()

    try:
        resolved_advertiser_id = None
        resolved_client_id = None

        # -----------------------------------------
        # 1. Client Portal 요청
        # -----------------------------------------
        if role == "client":
            client_id = token_payload[
                "clientId"
            ]

            user_id = token_payload[
                "sub"
            ]

            client_user = connection.execute(
                """
                SELECT
                    id,
                    client_id,
                    advertiser_id
                FROM client_users
                WHERE id = ?
                  AND client_id = ?
                LIMIT 1
                """,
                (
                    user_id,
                    client_id,
                ),
            ).fetchone()

            if (
                client_user is None
                or not client_user[
                    "advertiser_id"
                ]
            ):
                raise HTTPException(
                    status_code=404,
                    detail=
                        "Client 정보를 찾을 수 없습니다.",
                )

            proposal_row = connection.execute(
                """
                SELECT
                    id,
                    advertiser_id,
                    client_id
                FROM client_proposals
                WHERE id = ?
                  AND client_id = ?
                  AND advertiser_id = ?
                LIMIT 1
                """,
                (
                    proposal_id,
                    client_id,
                    client_user[
                        "advertiser_id"
                    ],
                ),
            ).fetchone()

            if proposal_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "이 Client가 접근할 수 있는 제안이 아닙니다.",
                )

            resolved_advertiser_id = (
                proposal_row[
                    "advertiser_id"
                ]
            )

            resolved_client_id = (
                proposal_row[
                    "client_id"
                ]
            )

        # -----------------------------------------
        # 2. Operator 요청
        # -----------------------------------------
        elif role == "operator":
            operator_id = token_payload[
                "sub"
            ]

            if not advertiserId:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "운영자 요청에는 advertiserId가 필요합니다.",
                )

            advertiser = connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    advertiserId,
                    operator_id,
                ),
            ).fetchone()

            if advertiser is None:
                raise HTTPException(
                    status_code=403,
                    detail=
                        "해당 광고주에 접근할 권한이 없습니다.",
                )

            proposal_row = connection.execute(
                """
                SELECT
                    id,
                    advertiser_id,
                    client_id
                FROM client_proposals
                WHERE id = ?
                  AND advertiser_id = ?
                LIMIT 1
                """,
                (
                    proposal_id,
                    advertiserId,
                ),
            ).fetchone()

            if proposal_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "선택한 광고주의 제안을 찾을 수 없습니다.",
                )

            resolved_advertiser_id = (
                proposal_row[
                    "advertiser_id"
                ]
            )

            resolved_client_id = (
                proposal_row[
                    "client_id"
                ]
            )

        # -----------------------------------------
        # 3. 허용되지 않은 role
        # -----------------------------------------
        else:
            raise HTTPException(
                status_code=403,
                detail=
                    "허용되지 않은 사용자 역할입니다.",
            )

        # -----------------------------------------
        # 4. 메시지 조회
        # -----------------------------------------
        rows = connection.execute(
            """
            SELECT
                id,
                proposal_id,
                sender_type,
                sender_name,
                message,
                action_url,
                action_label,
                is_read,
                read_at,
                created_at
            FROM proposal_messages
            WHERE proposal_id = ?
            ORDER BY created_at ASC
            """,
            (
                proposal_id,
            ),
        ).fetchall()

        messages = [
            {
                "id":
                    row["id"],
                "proposalId":
                    row["proposal_id"],
                "senderType":
                    row["sender_type"],
                "senderName":
                    row["sender_name"],
                "message":
                    row["message"],
                "actionUrl":
                    row["action_url"],
                "actionLabel":
                    row["action_label"],
                "isRead":
                    bool(
                        row["is_read"]
                    ),
                "readAt":
                    row["read_at"],
                "createdAt":
                    row["created_at"],
            }
            for row in rows
        ]

        return {
            "status": "ok",
            "advertiserId":
                resolved_advertiser_id,
            "clientId":
                resolved_client_id,
            "messages":
                messages,
        }

    finally:
        connection.close()


@app.patch("/client-proposals/{proposal_id}/messages/read")
def mark_proposal_messages_as_read(
    proposal_id: str,
    payload: ProposalMessagesReadPayload,
    advertiserId: str | None = None,
    clientId: str | None = None,
    token_payload = Depends(
        require_authenticated_user
    ),
):
    role = token_payload.get(
        "role"
    )

    connection = get_db_connection()

    try:
        resolved_advertiser_id = None
        resolved_client_id = None

        # -----------------------------------------
        # 1. Operator 읽음 처리
        # -----------------------------------------
        if payload.readerType == "internal":
            if role != "operator":
                raise HTTPException(
                    status_code=403,
                    detail="운영자 권한이 필요합니다.",
                )

            operator_id = token_payload[
                "sub"
            ]

            if not advertiserId:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "내부 운영자 요청에는 advertiserId가 필요합니다.",
                )

            advertiser = connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    advertiserId,
                    operator_id,
                ),
            ).fetchone()

            if advertiser is None:
                raise HTTPException(
                    status_code=403,
                    detail=
                        "해당 광고주에 접근할 권한이 없습니다.",
                )

            proposal_row = connection.execute(
                """
                SELECT
                    id,
                    advertiser_id,
                    client_id
                FROM client_proposals
                WHERE id = ?
                  AND advertiser_id = ?
                LIMIT 1
                """,
                (
                    proposal_id,
                    advertiserId,
                ),
            ).fetchone()

            if proposal_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "선택한 광고주의 제안을 찾을 수 없습니다.",
                )

            resolved_advertiser_id = (
                proposal_row[
                    "advertiser_id"
                ]
            )

            resolved_client_id = (
                proposal_row[
                    "client_id"
                ]
            )

            sender_type_to_mark = "client"

        # -----------------------------------------
        # 2. Client 읽음 처리
        # -----------------------------------------
        elif payload.readerType == "client":
            if role != "client":
                raise HTTPException(
                    status_code=403,
                    detail="Client 권한이 필요합니다.",
                )

            client_id = token_payload[
                "clientId"
            ]

            user_id = token_payload[
                "sub"
            ]

            client_row = connection.execute(
                """
                SELECT
                    id,
                    client_id,
                    advertiser_id
                FROM client_users
                WHERE id = ?
                  AND client_id = ?
                LIMIT 1
                """,
                (
                    user_id,
                    client_id,
                ),
            ).fetchone()

            if client_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "클라이언트 정보를 찾을 수 없습니다.",
                )

            client_advertiser_id = (
                client_row[
                    "advertiser_id"
                ]
            )

            if not client_advertiser_id:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "클라이언트에 연결된 광고주가 없습니다.",
                )

            proposal_row = connection.execute(
                """
                SELECT
                    id,
                    advertiser_id,
                    client_id
                FROM client_proposals
                WHERE id = ?
                  AND client_id = ?
                  AND advertiser_id = ?
                LIMIT 1
                """,
                (
                    proposal_id,
                    client_id,
                    client_advertiser_id,
                ),
            ).fetchone()

            if proposal_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "해당 클라이언트의 제안을 찾을 수 없습니다.",
                )

            resolved_advertiser_id = (
                proposal_row[
                    "advertiser_id"
                ]
            )

            resolved_client_id = (
                proposal_row[
                    "client_id"
                ]
            )

            sender_type_to_mark = "internal"

        # -----------------------------------------
        # 3. 잘못된 readerType
        # -----------------------------------------
        else:
            raise HTTPException(
                status_code=400,
                detail=
                    "readerType은 client 또는 internal이어야 합니다.",
            )

        # -----------------------------------------
        # 4. 읽음 처리
        # -----------------------------------------
        read_at = datetime.now().isoformat()

        cursor = connection.execute(
            """
            UPDATE proposal_messages
            SET
                is_read = 1,
                read_at = ?
            WHERE proposal_id = ?
              AND sender_type = ?
              AND is_read = 0
            """,
            (
                read_at,
                proposal_id,
                sender_type_to_mark,
            ),
        )

        connection.commit()

        return {
            "status": "updated",
            "advertiserId":
                resolved_advertiser_id,
            "clientId":
                resolved_client_id,
            "proposalId":
                proposal_id,
            "updatedCount":
                cursor.rowcount,
            "readAt":
                read_at,
        }

    finally:
        connection.close()


@app.get("/message-unread-count")
def get_message_unread_count(
    readerType: str,
    clientId: str | None = None,
    advertiserId: str | None = None,
    token_payload = Depends(
        require_authenticated_user
    ),
):
    role = token_payload.get(
        "role"
    )

    connection = get_db_connection()

    try:
        resolved_client_id = None
        resolved_advertiser_id = None

        # -----------------------------------------
        # 1. Client가 읽어야 하는
        #    운영자 메시지 개수
        # -----------------------------------------
        if readerType == "client":
            if role != "client":
                raise HTTPException(
                    status_code=403,
                    detail="Client 권한이 필요합니다.",
                )

            client_id = token_payload[
                "clientId"
            ]

            user_id = token_payload[
                "sub"
            ]

            client_user = connection.execute(
                """
                SELECT
                    id,
                    client_id,
                    advertiser_id
                FROM client_users
                WHERE id = ?
                  AND client_id = ?
                LIMIT 1
                """,
                (
                    user_id,
                    client_id,
                ),
            ).fetchone()

            if client_user is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "Client 계정을 찾을 수 없습니다.",
                )

            if not client_user[
                "advertiser_id"
            ]:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "이 Client 계정에 광고주가 연결되어 있지 않습니다.",
                )

            resolved_client_id = (
                client_id
            )

            resolved_advertiser_id = (
                client_user[
                    "advertiser_id"
                ]
            )

            row = connection.execute(
                """
                SELECT COUNT(*) AS unread_count
                FROM proposal_messages
                INNER JOIN client_proposals
                    ON client_proposals.id =
                       proposal_messages.proposal_id
                WHERE client_proposals.client_id = ?
                  AND client_proposals.advertiser_id = ?
                  AND proposal_messages.sender_type = 'internal'
                  AND proposal_messages.is_read = 0
                """,
                (
                    resolved_client_id,
                    resolved_advertiser_id,
                ),
            ).fetchone()

        # -----------------------------------------
        # 2. Operator가 읽어야 하는
        #    Client 메시지 개수
        # -----------------------------------------
        elif readerType == "internal":
            if role != "operator":
                raise HTTPException(
                    status_code=403,
                    detail="운영자 권한이 필요합니다.",
                )

            operator_id = token_payload[
                "sub"
            ]

            if not advertiserId:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "advertiserId가 필요합니다.",
                )

            advertiser = connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    advertiserId,
                    operator_id,
                ),
            ).fetchone()

            if advertiser is None:
                raise HTTPException(
                    status_code=403,
                    detail=
                        "해당 광고주에 접근할 권한이 없습니다.",
                )

            resolved_advertiser_id = (
                advertiserId
            )

            resolved_client_id = (
                clientId
            )

            row = connection.execute(
                """
                SELECT COUNT(*) AS unread_count
                FROM proposal_messages
                INNER JOIN client_proposals
                    ON client_proposals.id =
                       proposal_messages.proposal_id
                WHERE client_proposals.advertiser_id = ?
                  AND proposal_messages.sender_type = 'client'
                  AND proposal_messages.is_read = 0
                """,
                (
                    resolved_advertiser_id,
                ),
            ).fetchone()

        # -----------------------------------------
        # 3. 잘못된 readerType
        # -----------------------------------------
        else:
            raise HTTPException(
                status_code=400,
                detail=
                    "readerType은 client 또는 internal이어야 합니다.",
            )

        unread_count = (
            row["unread_count"]
            if row is not None
            else 0
        )

        return {
            "status": "ok",
            "readerType":
                readerType,
            "clientId":
                resolved_client_id,
            "advertiserId":
                resolved_advertiser_id,
            "unreadCount":
                unread_count,
        }

    finally:
        connection.close()


@app.post("/client-proposals/{proposal_id}/events")
def create_proposal_event(
    proposal_id: str,
    payload: ProposalEventPayload,
    advertiserId: str | None = None,
    clientId: str | None = None,
    token_payload = Depends(
        require_authenticated_user
    ),
):
    role = token_payload.get(
        "role"
    )

    connection = get_db_connection()

    try:
        resolved_advertiser_id = None
        resolved_client_id = None

        # -----------------------------------------
        # 1. Operator 요청
        # -----------------------------------------
        if role == "operator":
            operator_id = token_payload[
                "sub"
            ]

            if not advertiserId:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "운영자 요청에는 advertiserId가 필요합니다.",
                )

            advertiser = connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    advertiserId,
                    operator_id,
                ),
            ).fetchone()

            if advertiser is None:
                raise HTTPException(
                    status_code=403,
                    detail=
                        "해당 광고주에 접근할 권한이 없습니다.",
                )

            existing_proposal = (
                connection.execute(
                    """
                    SELECT
                        id,
                        advertiser_id,
                        client_id
                    FROM client_proposals
                    WHERE id = ?
                      AND advertiser_id = ?
                    LIMIT 1
                    """,
                    (
                        proposal_id,
                        advertiserId,
                    ),
                ).fetchone()
            )

            if existing_proposal is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "선택한 광고주의 제안을 찾을 수 없습니다.",
                )

            resolved_advertiser_id = (
                existing_proposal[
                    "advertiser_id"
                ]
            )

            resolved_client_id = (
                existing_proposal[
                    "client_id"
                ]
            )

        # -----------------------------------------
        # 2. Client 요청
        # -----------------------------------------
        elif role == "client":
            client_id = token_payload[
                "clientId"
            ]

            user_id = token_payload[
                "sub"
            ]

            client_row = connection.execute(
                """
                SELECT
                    id,
                    client_id,
                    advertiser_id
                FROM client_users
                WHERE id = ?
                  AND client_id = ?
                LIMIT 1
                """,
                (
                    user_id,
                    client_id,
                ),
            ).fetchone()

            if client_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "Client 정보를 확인할 수 없습니다.",
                )

            client_advertiser_id = (
                client_row[
                    "advertiser_id"
                ]
            )

            if not client_advertiser_id:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "이 Client 계정에 광고주가 연결되어 있지 않습니다.",
                )

            existing_proposal = (
                connection.execute(
                    """
                    SELECT
                        id,
                        advertiser_id,
                        client_id
                    FROM client_proposals
                    WHERE id = ?
                      AND client_id = ?
                      AND advertiser_id = ?
                    LIMIT 1
                    """,
                    (
                        proposal_id,
                        client_id,
                        client_advertiser_id,
                    ),
                ).fetchone()
            )

            if existing_proposal is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "이 Client가 접근할 수 있는 제안이 아닙니다.",
                )

            resolved_advertiser_id = (
                existing_proposal[
                    "advertiser_id"
                ]
            )

            resolved_client_id = (
                existing_proposal[
                    "client_id"
                ]
            )

        # -----------------------------------------
        # 3. 허용되지 않은 role
        # -----------------------------------------
        else:
            raise HTTPException(
                status_code=403,
                detail=
                    "허용되지 않은 사용자 역할입니다.",
            )

        # -----------------------------------------
        # 4. Event 저장
        # -----------------------------------------
        connection.execute(
            """
            INSERT INTO proposal_events (
                id,
                proposal_id,
                event_type,
                status,
                message,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                payload.id,
                proposal_id,
                payload.eventType,
                payload.status,
                payload.message,
                payload.createdAt,
            ),
        )

        connection.commit()

        return {
            "status": "saved",
            "advertiserId":
                resolved_advertiser_id,
            "clientId":
                resolved_client_id,
            "event":
                payload.model_dump(),
        }

    finally:
        connection.close()


@app.get("/client-proposals/{proposal_id}/events")
def get_proposal_events(
    proposal_id: str,
    advertiserId: str | None = None,
    clientId: str | None = None,
    token_payload = Depends(
        require_authenticated_user
    ),
):
    role = token_payload.get(
        "role"
    )

    connection = get_db_connection()

    try:
        resolved_advertiser_id = None
        resolved_client_id = None

        # -----------------------------------------
        # 1. Operator 요청
        # -----------------------------------------
        if role == "operator":
            operator_id = token_payload[
                "sub"
            ]

            if not advertiserId:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "운영자 요청에는 advertiserId가 필요합니다.",
                )

            advertiser = connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    advertiserId,
                    operator_id,
                ),
            ).fetchone()

            if advertiser is None:
                raise HTTPException(
                    status_code=403,
                    detail=
                        "해당 광고주에 접근할 권한이 없습니다.",
                )

            proposal = connection.execute(
                """
                SELECT
                    id,
                    advertiser_id,
                    client_id
                FROM client_proposals
                WHERE id = ?
                  AND advertiser_id = ?
                LIMIT 1
                """,
                (
                    proposal_id,
                    advertiserId,
                ),
            ).fetchone()

            if proposal is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "선택한 광고주의 제안을 찾을 수 없습니다.",
                )

            resolved_advertiser_id = (
                proposal[
                    "advertiser_id"
                ]
            )

            resolved_client_id = (
                proposal[
                    "client_id"
                ]
            )

        # -----------------------------------------
        # 2. Client 요청
        # -----------------------------------------
        elif role == "client":
            client_id = token_payload[
                "clientId"
            ]

            user_id = token_payload[
                "sub"
            ]

            client_row = connection.execute(
                """
                SELECT
                    id,
                    client_id,
                    advertiser_id
                FROM client_users
                WHERE id = ?
                  AND client_id = ?
                LIMIT 1
                """,
                (
                    user_id,
                    client_id,
                ),
            ).fetchone()

            if client_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "Client 정보를 확인할 수 없습니다.",
                )

            client_advertiser_id = (
                client_row[
                    "advertiser_id"
                ]
            )

            if not client_advertiser_id:
                raise HTTPException(
                    status_code=400,
                    detail=
                        "이 Client 계정에 광고주가 연결되어 있지 않습니다.",
                )

            proposal = connection.execute(
                """
                SELECT
                    id,
                    advertiser_id,
                    client_id
                FROM client_proposals
                WHERE id = ?
                  AND client_id = ?
                  AND advertiser_id = ?
                LIMIT 1
                """,
                (
                    proposal_id,
                    client_id,
                    client_advertiser_id,
                ),
            ).fetchone()

            if proposal is None:
                raise HTTPException(
                    status_code=404,
                    detail=
                        "이 Client가 접근할 수 있는 제안이 아닙니다.",
                )

            resolved_advertiser_id = (
                proposal[
                    "advertiser_id"
                ]
            )

            resolved_client_id = (
                proposal[
                    "client_id"
                ]
            )

        # -----------------------------------------
        # 3. 허용되지 않은 role
        # -----------------------------------------
        else:
            raise HTTPException(
                status_code=403,
                detail=
                    "허용되지 않은 사용자 역할입니다.",
            )

        # -----------------------------------------
        # 4. Event 조회
        # -----------------------------------------
        rows = connection.execute(
            """
            SELECT
                id,
                proposal_id,
                event_type,
                status,
                message,
                created_at
            FROM proposal_events
            WHERE proposal_id = ?
            ORDER BY created_at ASC
            """,
            (
                proposal_id,
            ),
        ).fetchall()

        events = [
            {
                "id":
                    row["id"],
                "proposalId":
                    row["proposal_id"],
                "eventType":
                    row["event_type"],
                "status":
                    row["status"],
                "message":
                    row["message"],
                "createdAt":
                    row["created_at"],
            }
            for row in rows
        ]

        return {
            "status": "ok",
            "advertiserId":
                resolved_advertiser_id,
            "clientId":
                resolved_client_id,
            "events":
                events,
        }

    finally:
        connection.close()

@app.post("/optimization/naver/preview")
def preview_naver_optimization(
    payload: NaverOptimizationPreviewPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    try:
        # -----------------------------------------
        # 1. 현재 연결된 Naver 계정 확인
        # -----------------------------------------

        connection = get_db_connection()

        try:
            connection_row = (
                connection.execute(
                    """
                    SELECT
                        id,
                        account_id,
                        customer_id,
                        conversion_tracking_start_date
                    FROM ad_connections
                    WHERE platform = ?
                      AND advertiser_id = ?
                      AND status = ?
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    (
                        "naver",
                        payload.advertiserId,
                        "connected",
                    ),
                ).fetchone()
            )

            if connection_row is None:
                raise OptimizationPreviewServiceError(
                    404,
                    (
                        "선택한 광고주에 연결된 "
                        "Naver Ads 계정이 없습니다."
                    ),
                )

            saved_start_date = (
                connection_row[
                    "conversion_tracking_start_date"
                ]
            )

            connection_id = (
                connection_row["id"]
            )

            policy_account_id = str(
                connection_row[
                    "customer_id"
                ]
                or connection_row[
                    "account_id"
                ]
                or ""
            )

        finally:
            connection.close()

        # -----------------------------------------
        # 2. 이미 저장된 시작일이 있으면
        #    Naver API를 다시 탐색하지 않고 사용
        # -----------------------------------------

        if saved_start_date:
            revenue_valid_start_date = (
                str(saved_start_date)
            )

        else:
            # -------------------------------------
            # 3. 최초 1회만
            #    Conversion History coverage 탐색
            # -------------------------------------

            conversion_coverage = (
                find_naver_conversion_history_coverage_internal(
                    advertiser_id=
                        payload.advertiserId,

                    max_lookback_days=
                        120,

                    step_days=
                        14,

                    probe_window_days=
                        3,

                    token_payload=
                        token_payload,
                )
            )

            revenue_valid_start_date = (
                conversion_coverage.get(
                    "earliestAvailableDate"
                )
                if conversion_coverage.get(
                    "status"
                ) == "ok"
                else None
            )

            # -------------------------------------
            # 4. 탐색 성공 시 DB에 최초 1회 저장
            # -------------------------------------

            if revenue_valid_start_date:
                connection = (
                    get_db_connection()
                )

                try:
                    connection.execute(
                        """
                        UPDATE ad_connections
                        SET
                            conversion_tracking_start_date = ?,
                            updated_at = ?
                        WHERE id = ?
                          AND conversion_tracking_start_date IS NULL
                        """,
                        (
                            revenue_valid_start_date,
                            datetime.now().isoformat(),
                            connection_id,
                        ),
                    )

                    connection.commit()

                finally:
                    connection.close()

        # -----------------------------------------
        # 5. Campaign Budget Policy 조회
        #
        # PDF 정의:
        #
        # x0_i = current_daily_budget
        # L_i  = min_daily_budget
        # U_i  = max_daily_budget
        # B    = sum(x0_i)
        #
        # optimization eligible 캠페인만
        # 실제 optimization portfolio에 포함한다.
        # -----------------------------------------

        connection = get_db_connection()

        try:
            budget_policy_rows = (
                connection.execute(
                    """
                    SELECT
                        campaign_id,
                        campaign_name,

                        current_daily_budget,
                        min_daily_budget,
                        max_daily_budget,

                        use_daily_budget,
                        shared_budget_id,
                        campaign_status,
                        user_lock

                    FROM
                        ad_campaign_budget_policies

                    WHERE advertiser_id = ?
                      AND platform = ?
                      AND account_id = ?

                    ORDER BY
                        campaign_name ASC,
                        campaign_id ASC
                    """,
                    (
                        payload.advertiserId,
                        "naver",
                        policy_account_id,
                    ),
                ).fetchall()
            )

        finally:
            connection.close()

        # -----------------------------------------
        # 6. Optimization eligible 캠페인 추출
        # -----------------------------------------

        eligible_policy_rows = []

        for row in budget_policy_rows:
            current_budget = (
                row[
                    "current_daily_budget"
                ]
            )

            use_daily_budget = (
                row[
                    "use_daily_budget"
                ]
            )

            shared_budget_id = (
                row[
                    "shared_budget_id"
                ]
            )

            campaign_status = str(
                row[
                    "campaign_status"
                ]
                or ""
            ).strip()

            user_lock = (
                row[
                    "user_lock"
                ]
            )

            optimization_eligible = (
                campaign_status
                == "ELIGIBLE"
                and int(
                    user_lock or 0
                ) == 0
                and not shared_budget_id
                and int(
                    use_daily_budget or 0
                ) == 1
                and current_budget is not None
                and float(
                    current_budget
                ) > 0
            )

            if optimization_eligible:
                eligible_policy_rows.append(
                    row
                )

        # -----------------------------------------
        # 7. 최소 2개 캠페인이 있어야
        #    budget reallocation 가능
        # -----------------------------------------

        if len(
            eligible_policy_rows
        ) < 2:
            return {
                "status":
                    "blocked",

                "optimizationScope":
                    "campaign",

                "blockCode":
                    (
                        "TOO_FEW_BUDGET_"
                        "ELIGIBLE_CAMPAIGNS"
                    ),

                "message":
                    (
                        "현재 예산 정책 기준으로 "
                        "최적화 가능한 캠페인이 "
                        "2개 미만입니다."
                    ),

                "eligibleCampaignCount":
                    len(
                        eligible_policy_rows
                    ),

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        # -----------------------------------------
        # 8. L / U 미설정 확인
        #
        # 임의의 default bound는 만들지 않는다.
        # -----------------------------------------

        missing_policy_campaigns = [
            {
                "campaignId":
                    row[
                        "campaign_id"
                    ],

                "campaignName":
                    row[
                        "campaign_name"
                    ],
            }

            for row
            in eligible_policy_rows

            if (
                row[
                    "min_daily_budget"
                ]
                is None
                or row[
                    "max_daily_budget"
                ]
                is None
            )
        ]

        if missing_policy_campaigns:
            return {
                "status":
                    "blocked",

                "optimizationScope":
                    "campaign",

                "blockCode":
                    (
                        "MISSING_CAMPAIGN_"
                        "BUDGET_POLICY"
                    ),

                "message":
                    (
                        "최적화 대상 캠페인의 "
                        "최소/최대 예산 정책이 "
                        "모두 설정되어야 합니다."
                    ),

                "missingPolicyCount":
                    len(
                        missing_policy_campaigns
                    ),

                "missingCampaigns":
                    missing_policy_campaigns,

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        # -----------------------------------------
        # 9. x0 / L / U payload 생성
        # -----------------------------------------

        current_budgets = {}

        budget_bounds = {}

        for row in eligible_policy_rows:
            campaign_id = str(
                row[
                    "campaign_id"
                ]
            )

            current_budget = float(
                row[
                    "current_daily_budget"
                ]
            )

            min_budget = float(
                row[
                    "min_daily_budget"
                ]
            )

            max_budget = float(
                row[
                    "max_daily_budget"
                ]
            )

            # -------------------------------------
            # Business Constraint validation
            # -------------------------------------

            if (
                min_budget < 0
                or max_budget <= 0
                or min_budget > max_budget
            ):
                return {
                    "status":
                        "blocked",

                    "optimizationScope":
                        "campaign",

                    "blockCode":
                        (
                            "INVALID_CAMPAIGN_"
                            "BUDGET_POLICY"
                        ),

                    "message":
                        (
                            "캠페인 최소/최대 "
                            "예산 범위가 올바르지 "
                            "않습니다."
                        ),

                    "campaignId":
                        campaign_id,

                    "minDailyBudget":
                        min_budget,

                    "maxDailyBudget":
                        max_budget,

                    "productionWriteEnabled":
                        False,

                    "shadowOnly":
                        True,
                }

            if not (
                min_budget
                <= current_budget
                <= max_budget
            ):
                return {
                    "status":
                        "blocked",

                    "optimizationScope":
                        "campaign",

                    "blockCode":
                        (
                            "CURRENT_BUDGET_"
                            "OUTSIDE_POLICY_BOUNDS"
                        ),

                    "message":
                        (
                            "현재 Naver 일예산이 "
                            "설정된 최소/최대 예산 "
                            "범위를 벗어났습니다."
                        ),

                    "campaignId":
                        campaign_id,

                    "currentDailyBudget":
                        current_budget,

                    "minDailyBudget":
                        min_budget,

                    "maxDailyBudget":
                        max_budget,

                    "productionWriteEnabled":
                        False,

                    "shadowOnly":
                        True,
                }

            current_budgets[
                campaign_id
            ] = current_budget

            budget_bounds[
                campaign_id
            ] = {
                "min":
                    min_budget,

                "max":
                    max_budget,
            }

        # -----------------------------------------
        # 10. Portfolio Total Budget B
        #
        # 현재 단계에서는
        # B = sum(x0_i)
        #
        # 이후 UI의 명시적 총예산 입력을
        # 연결하면 planner input으로 교체 가능.
        # -----------------------------------------

        total_daily_budget = float(
            sum(
                current_budgets.values()
            )
        )

        # -----------------------------------------
        # 11. Optimization Service에 전달
        # -----------------------------------------

        return run_naver_optimization_preview(
            advertiser_id=
                payload.advertiserId,

            operator_id=
                operator_id,

            account_id=
                payload.accountId,

            max_budget_change_pct=
                payload.maxBudgetChangePct,

            revenue_valid_start_date=
                revenue_valid_start_date,

            optimization_scope=
                "campaign",

            current_budgets=
                current_budgets,

            budget_bounds=
                budget_bounds,

            total_daily_budget=
                total_daily_budget,
        )

    except OptimizationPreviewServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error

@app.post(
    "/optimization/campaign-budget-scaling-preview"
)
def preview_campaign_budget_scaling(
    payload:
        CampaignBudgetScalingPreviewPayload,

    token_payload=Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    # -----------------------------------------
    # 1. 기본 validation
    # -----------------------------------------

    if not payload.advertiserId:
        raise HTTPException(
            status_code=400,
            detail=(
                "advertiserId가 필요합니다."
            ),
        )

    data_source = str(
        payload.dataSource
        or "naver"
    ).strip().lower()

    if data_source not in {
        "naver",
        "mock",
    }:
        raise HTTPException(
            status_code=400,
            detail=(
                "dataSource는 "
                "'naver' 또는 'mock'이어야 합니다."
            ),
        )

    multipliers = []

    for raw_multiplier in (
        payload.budgetMultipliers
    ):
        try:
            multiplier = float(
                raw_multiplier
            )

        except (
            TypeError,
            ValueError,
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "budgetMultipliers에는 "
                    "숫자만 입력할 수 있습니다."
                ),
            )

        if (
            not math.isfinite(
                multiplier
            )
            or multiplier <= 0
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "budgetMultiplier는 "
                    "0보다 커야 합니다."
                ),
            )

        multipliers.append(
            multiplier
        )

    if not multipliers:
        raise HTTPException(
            status_code=400,
            detail=(
                "분석할 예산 시나리오가 없습니다."
            ),
        )

    # -----------------------------------------
    # 2. Advertiser 권한 확인
    #
    # Mock / Naver 모두 advertiser ownership은
    # 반드시 검증합니다.
    # -----------------------------------------

    connection = get_db_connection()

    try:
        advertiser = (
            connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    payload.advertiserId,
                    operator_id,
                ),
            ).fetchone()
        )

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "해당 광고주에 접근할 "
                    "권한이 없습니다."
                ),
            )

    finally:
        connection.close()

    # -----------------------------------------
    # 공통 변수
    # -----------------------------------------

    performance_records = []

    current_budgets = {}

    budget_bounds = {}

    account_id = None

    revenue_valid_start_date = None

    # =========================================
    # 3-A. MOCK DATA
    #
    # Mock은 Naver connection / Budget Policy를
    # 절대로 조회하지 않습니다.
    # =========================================

    if data_source == "mock":
        performance_records = list(
            payload.performanceRecords
            or []
        )

        raw_current_budgets = (
            payload.currentBudgets
            or {}
        )

        raw_budget_bounds = (
            payload.budgetBounds
            or {}
        )

        revenue_valid_start_date = (
            payload.revenueValidStartDate
        )

        account_id = "mock"

        if not performance_records:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "NO_FILTERED_PERFORMANCE_DATA",

                "message":
                    (
                        "현재 상단 필터 조건에 "
                        "해당하는 Mock 성과 데이터가 "
                        "없습니다."
                    ),

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        # -------------------------------------
        # Mock current budget x0 validation
        # -------------------------------------

        for (
            campaign_id,
            raw_budget,
        ) in raw_current_budgets.items():
            try:
                current_budget = float(
                    raw_budget
                )

            except (
                TypeError,
                ValueError,
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Mock currentBudgets에 "
                        "유효하지 않은 값이 있습니다."
                    ),
                )

            if (
                not math.isfinite(
                    current_budget
                )
                or current_budget <= 0
            ):
                continue

            current_budgets[
                str(
                    campaign_id
                )
            ] = current_budget

        if len(
            current_budgets
        ) < 2:
            return {
                "status":
                    "blocked",

                "blockCode":
                    (
                        "TOO_FEW_BUDGET_"
                        "ELIGIBLE_CAMPAIGNS"
                    ),

                "message":
                    (
                        "예산 확장 분석에는 "
                        "최소 2개 캠페인이 필요합니다."
                    ),

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        # -------------------------------------
        # Mock L / U validation
        # -------------------------------------

        missing_policy_ids = []

        invalid_policy_ids = []

        for (
            campaign_id,
            current_budget,
        ) in current_budgets.items():
            raw_bound = (
                raw_budget_bounds.get(
                    campaign_id
                )
            )

            if not isinstance(
                raw_bound,
                dict,
            ):
                missing_policy_ids.append(
                    campaign_id
                )

                continue

            try:
                min_budget = float(
                    raw_bound.get(
                        "min"
                    )
                )

                max_budget = float(
                    raw_bound.get(
                        "max"
                    )
                )

            except (
                TypeError,
                ValueError,
            ):
                invalid_policy_ids.append(
                    campaign_id
                )

                continue

            if (
                not math.isfinite(
                    min_budget
                )
                or not math.isfinite(
                    max_budget
                )
                or min_budget < 0
                or max_budget <
                    min_budget
                or current_budget <
                    min_budget
                or current_budget >
                    max_budget
            ):
                invalid_policy_ids.append(
                    campaign_id
                )

                continue

            budget_bounds[
                campaign_id
            ] = {
                "min":
                    min_budget,

                "max":
                    max_budget,
            }

        if missing_policy_ids:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "MISSING_CAMPAIGN_BUDGET_POLICY",

                "message":
                    (
                        "Mock 캠페인의 최소·최대 "
                        "예산 범위가 일부 누락되었습니다."
                    ),

                "missingCampaignIds":
                    missing_policy_ids,

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        if invalid_policy_ids:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "INVALID_CAMPAIGN_BUDGET_POLICY",

                "message":
                    (
                        "Mock 캠페인의 예산 범위가 "
                        "유효하지 않습니다."
                    ),

                "invalidCampaignIds":
                    invalid_policy_ids,

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        # currentBudgets에 존재하는 캠페인만
        # worker로 전달합니다.

        allowed_campaign_ids = set(
            current_budgets.keys()
        )

        performance_records = [
            record
            for record
            in performance_records
            if str(
                record.get(
                    "campaign_id"
                )
                or ""
            )
            in allowed_campaign_ids
        ]

        if not performance_records:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "NO_FILTERED_PERFORMANCE_DATA",

                "message":
                    (
                        "Mock Budget Policy와 "
                        "일치하는 성과 데이터가 없습니다."
                    ),

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        if not revenue_valid_start_date:
            return {
                "status":
                    "blocked",

                "blockCode":
                    (
                        "CONVERSION_HISTORY_"
                        "COVERAGE_UNAVAILABLE"
                    ),

                "message":
                    (
                        "Mock Revenue 유효 시작일을 "
                        "확인할 수 없습니다."
                    ),

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

    # =========================================
    # 3-B. NAVER DATA
    #
    # performanceRecords:
    #   상단 필터가 적용된 frontend 데이터
    #
    # x0 / L / U:
    #   반드시 DB의 실제 Naver Budget Policy
    # =========================================

    else:
        performance_records = list(
            payload.performanceRecords
            or []
        )

        if not performance_records:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "NO_FILTERED_PERFORMANCE_DATA",

                "message":
                    (
                        "현재 상단 필터 조건에 "
                        "해당하는 Naver 성과 데이터가 "
                        "없습니다."
                    ),

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        selected_campaign_ids = {
            str(
                record.get(
                    "campaign_id"
                )
                or ""
            )
            for record
            in performance_records
            if str(
                record.get(
                    "campaign_id"
                )
                or ""
            ).strip()
        }

        if not selected_campaign_ids:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "NO_FILTERED_CAMPAIGNS",

                "message":
                    (
                        "현재 필터 조건에서 "
                        "Naver 캠페인을 확인할 수 없습니다."
                    ),

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        connection = get_db_connection()

        try:
            connection_row = (
                connection.execute(
                    """
                    SELECT
                        id,
                        account_id,
                        customer_id,
                        conversion_tracking_start_date
                    FROM ad_connections
                    WHERE platform = ?
                      AND advertiser_id = ?
                      AND status = ?
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    (
                        "naver",
                        payload.advertiserId,
                        "connected",
                    ),
                ).fetchone()
            )

            if connection_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "선택한 광고주에 연결된 "
                        "Naver Ads 계정이 없습니다."
                    ),
                )

            account_id = str(
                connection_row[
                    "customer_id"
                ]
                or connection_row[
                    "account_id"
                ]
                or ""
            )

            revenue_valid_start_date = (
                connection_row[
                    "conversion_tracking_start_date"
                ]
            )

            rows = (
                connection.execute(
                    """
                    SELECT
                        campaign_id,
                        current_daily_budget,
                        min_daily_budget,
                        max_daily_budget,
                        use_daily_budget,
                        shared_budget_id,
                        campaign_status,
                        user_lock
                    FROM
                        ad_campaign_budget_policies
                    WHERE advertiser_id = ?
                      AND platform = ?
                      AND account_id = ?
                    ORDER BY campaign_id ASC
                    """,
                    (
                        payload.advertiserId,
                        "naver",
                        account_id,
                    ),
                ).fetchall()
            )

        finally:
            connection.close()

        missing_policy_ids = []

        for row in rows:
            campaign_id = str(
                row[
                    "campaign_id"
                ]
            )

            # ---------------------------------
            # 상단 필터에서 제외된 캠페인은
            # optimizer portfolio에도 포함하지 않음
            # ---------------------------------

            if (
                campaign_id
                not in
                selected_campaign_ids
            ):
                continue

            current_budget = (
                row[
                    "current_daily_budget"
                ]
            )

            optimization_eligible = (
                str(
                    row[
                        "campaign_status"
                    ]
                    or ""
                ).strip()
                == "ELIGIBLE"
                and int(
                    row[
                        "user_lock"
                    ]
                    or 0
                ) == 0
                and not row[
                    "shared_budget_id"
                ]
                and int(
                    row[
                        "use_daily_budget"
                    ]
                    or 0
                ) == 1
                and current_budget
                is not None
                and float(
                    current_budget
                ) > 0
            )

            if not optimization_eligible:
                continue

            min_budget = (
                row[
                    "min_daily_budget"
                ]
            )

            max_budget = (
                row[
                    "max_daily_budget"
                ]
            )

            if (
                min_budget is None
                or max_budget is None
            ):
                missing_policy_ids.append(
                    campaign_id
                )

                continue

            current_budgets[
                campaign_id
            ] = float(
                current_budget
            )

            budget_bounds[
                campaign_id
            ] = {
                "min":
                    float(
                        min_budget
                    ),

                "max":
                    float(
                        max_budget
                    ),
            }

        if missing_policy_ids:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "MISSING_CAMPAIGN_BUDGET_POLICY",

                "message":
                    (
                        "현재 필터에 포함된 "
                        "최적화 대상 캠페인의 "
                        "최소·최대 예산 정책이 "
                        "필요합니다."
                    ),

                "missingCampaignIds":
                    missing_policy_ids,

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        if len(
            current_budgets
        ) < 2:
            return {
                "status":
                    "blocked",

                "blockCode":
                    (
                        "TOO_FEW_BUDGET_"
                        "ELIGIBLE_CAMPAIGNS"
                    ),

                "message":
                    (
                        "현재 필터 조건에서는 "
                        "최적화 가능한 캠페인이 "
                        "2개 미만입니다."
                    ),

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

        # 실제 Naver x0가 있는 캠페인만
        # worker 성과 데이터에도 남깁니다.

        allowed_campaign_ids = set(
            current_budgets.keys()
        )

        performance_records = [
            record
            for record
            in performance_records
            if str(
                record.get(
                    "campaign_id"
                )
                or ""
            )
            in allowed_campaign_ids
        ]

    # -----------------------------------------
    # 4. 현재 필터 기준 총 일예산 B0
    # -----------------------------------------

    current_total_budget = float(
        sum(
            current_budgets.values()
        )
    )

    if (
        not math.isfinite(
            current_total_budget
        )
        or current_total_budget <= 0
    ):
        return {
            "status":
                "blocked",

            "blockCode":
                "INVALID_CURRENT_BUDGET",

            "message":
                (
                    "현재 필터 기준 총 일예산을 "
                    "계산할 수 없습니다."
                ),

            "productionWriteEnabled":
                False,

            "shadowOnly":
                True,
        }

    # Mock에서 frontend가 보낸 total과
    # 계산된 current budget 합계가 다른 경우
    # 조용히 다른 값을 쓰지 않고 검증합니다.

    if (
        data_source == "mock"
        and payload.mockTotalDailyBudget
        is not None
    ):
        supplied_total = float(
            payload.mockTotalDailyBudget
        )

        if (
            math.isfinite(
                supplied_total
            )
            and abs(
                supplied_total -
                current_total_budget
            ) > 0.01
        ):
            return {
                "status":
                    "blocked",

                "blockCode":
                    "MOCK_BUDGET_TOTAL_MISMATCH",

                "message":
                    (
                        "Mock 총 일예산과 "
                        "캠페인별 현재예산 합계가 "
                        "일치하지 않습니다."
                    ),

                "calculatedTotalDailyBudget":
                    current_total_budget,

                "suppliedTotalDailyBudget":
                    supplied_total,

                "productionWriteEnabled":
                    False,

                "shadowOnly":
                    True,
            }

    # -----------------------------------------
    # 5. 각 Budget Scenario 실행
    # -----------------------------------------

    scenarios = []

    for multiplier in sorted(
        set(
            multipliers
        )
    ):
        scenario_budget = (
            current_total_budget
            * multiplier
        )

        try:
            result = (
                run_naver_optimization_preview(
                    advertiser_id=
                        payload.advertiserId,

                    operator_id=
                        operator_id,

                    account_id=
                        account_id,

                    max_budget_change_pct=
                        payload.maxBudgetChangePct,

                    revenue_valid_start_date=
                        (
                            str(
                                revenue_valid_start_date
                            )
                            if
                            revenue_valid_start_date
                            else None
                        ),

                    optimization_scope=
                        "campaign",

                    performance_records=
                        performance_records,

                    current_budgets=
                        current_budgets,

                    budget_bounds=
                        budget_bounds,

                    total_daily_budget=
                        scenario_budget,
                )
            )

        except OptimizationPreviewServiceError as error:
            scenarios.append(
                {
                    "multiplier":
                        multiplier,

                    "totalDailyBudget":
                        scenario_budget,

                    "status":
                        "error",

                    "message":
                        error.detail,
                }
            )

            continue

        scenarios.append(
            {
                "multiplier":
                    multiplier,

                "totalDailyBudget":
                    scenario_budget,

                "result":
                    result,

                "status":
                    result.get(
                        "status"
                    ),
            }
        )

    return {
        "status":
            "ok",

        "advertiserId":
            payload.advertiserId,

        "dataSource":
            data_source,

        "platform":
            (
                "mock"
                if data_source ==
                "mock"
                else "naver"
            ),

        "analysisType":
            "budget_scaling",

        "filters":
            payload.filters
            or {},

        "currentTotalDailyBudget":
            current_total_budget,

        "campaignCount":
            len(
                current_budgets
            ),

        "performanceRecordCount":
            len(
                performance_records
            ),

        "scenarioCount":
            len(
                scenarios
            ),

        "scenarios":
            scenarios,

        "productionWriteEnabled":
            False,

        "shadowOnly":
            True,
    }

def build_channel_optimization_panel(
    *,
    advertiser_id: str,
    operator_id: str,
    performance_records:
        list[dict] | None = None,
    data_source: str = "naver",
    revenue_valid_start_dates:
        dict[str, str] | None = None,
):
    connection = get_db_connection()

    try:
        # -----------------------------------------
        # 1. 광고주 권한 확인
        # -----------------------------------------

        advertiser = (
            connection.execute(
                """
                SELECT id
                FROM advertisers
                WHERE id = ?
                  AND owner_operator_id = ?
                LIMIT 1
                """,
                (
                    advertiser_id,
                    operator_id,
                ),
            ).fetchone()
        )

        if advertiser is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "해당 광고주에 접근할 "
                    "권한이 없습니다."
                ),
            )

        # -----------------------------------------
        # 2. 매체별 Conversion / Revenue
        #    유효 시작일 조회
        # -----------------------------------------

        connection_rows = (
            connection.execute(
                """
                SELECT
                    platform,
                    account_id,
                    customer_id,
                    status,
                    conversion_tracking_start_date
                FROM ad_connections
                WHERE advertiser_id = ?
                  AND status = 'connected'
                """,
                (
                    advertiser_id,
                ),
            ).fetchall()
        )

        revenue_validity_dates_by_platform = {}

        missing_revenue_validity_platforms = set()

        for connection_row in connection_rows:
            platform_key = str(
                connection_row["platform"]
                or ""
            ).strip().lower()

            if not platform_key:
                continue

            start_date = (
                connection_row[
                    "conversion_tracking_start_date"
                ]
            )

            # 동일 매체에 연결 계정이 여러 개인 경우
            # 하나라도 Revenue validity를 모르면
            # 해당 매체는 안전하게 미확인 상태로 둔다.
            if not start_date:
                missing_revenue_validity_platforms.add(
                    platform_key
                )
                continue

            revenue_validity_dates_by_platform.setdefault(
                platform_key,
                [],
            ).append(
                str(start_date)
            )

        revenue_validity_by_platform = {}

        all_platform_keys = (
            set(
                revenue_validity_dates_by_platform.keys()
            )
            | missing_revenue_validity_platforms
        )

        revenue_validity_by_platform = {}

        all_platform_keys = (
            set(
                revenue_validity_dates_by_platform.keys()
            )
            | missing_revenue_validity_platforms
        )

        for platform_key in all_platform_keys:

            if (
                platform_key
                in missing_revenue_validity_platforms
            ):
                revenue_validity_by_platform[
                    platform_key
                ] = None

                continue

            # 여러 계정이 하나의 매체로 합산되므로
            # 모든 계정의 Revenue가 유효한 시점인
            # 가장 늦은 시작일을 사용한다.
            revenue_validity_by_platform[
                platform_key
            ] = max(
                revenue_validity_dates_by_platform[
                    platform_key
                ]
            )

        # -----------------------------------------
        # 외부에서 전달된 Revenue validity가
        # 있으면 DB 값보다 우선 적용
        # -----------------------------------------

        for (
            raw_channel,
            raw_start_date,
        ) in (
            revenue_valid_start_dates
            or {}
        ).items():
            channel_key = str(
                raw_channel or ""
            ).strip().lower()

            start_date_value = str(
                raw_start_date or ""
            ).strip()

            if (
                channel_key
                and start_date_value
            ):
                revenue_validity_by_platform[
                    channel_key
                ] = start_date_value

        # -----------------------------------------
        # # 3. 전체 Daily Performance
        # -----------------------------------------

        # -----------------------------------------
        # 3. Daily Performance
        #
        # Frontend에서 필터된 데이터가 전달되면
        # 그것을 사용한다.
        #
        # 전달값이 없을 때만 기존 DB 조회.
        # -----------------------------------------

        if (
            performance_records
            is not None
        ):
            rows = []

            normalized_source = str(
                data_source
                or "naver"
            ).strip().lower()

            for raw_row in (
                performance_records
                or []
            ):
                if not isinstance(
                    raw_row,
                    dict,
                ):
                    continue

                date_value = str(
                    raw_row.get(
                        "date"
                    )
                    or ""
                ).strip()

                channel_value = str(
                    raw_row.get(
                        "channel"
                    )
                    or raw_row.get(
                        "platform"
                    )
                    or ""
                ).strip()

                platform_value = str(
                    raw_row.get(
                        "platform"
                    )
                    or channel_value
                ).strip()

                if (
                    not date_value
                    or not channel_value
                ):
                    continue

                normalized_row = {
                    "date":
                        date_value,

                    "platform":
                        platform_value,

                    "channel":
                        channel_value,

                    "spend":
                        float(
                            raw_row.get(
                                "spend"
                            )
                            or 0
                        ),

                    "impressions":
                        float(
                            raw_row.get(
                                "impressions"
                            )
                            or 0
                        ),

                    "clicks":
                        float(
                            raw_row.get(
                                "clicks"
                            )
                            or 0
                        ),

                    "conversions":
                        float(
                            raw_row.get(
                                "conversions"
                            )
                            or 0
                        ),

                    "revenue":
                        float(
                            raw_row.get(
                                "revenue"
                            )
                            or 0
                        ),
                }

                rows.append(
                    normalized_row
                )

                # ---------------------------------
                # Mock은 실제 Conversion tracking
                # metadata가 없으므로 테스트 데이터의
                # 첫 날짜를 validity 시작일로 사용.
                # ---------------------------------

                if (
                    normalized_source ==
                    "mock"
                ):
                    platform_key = str(
                        platform_value
                        or channel_value
                    ).strip().lower()

                    previous_date = (
                        revenue_validity_by_platform
                        .get(
                            platform_key
                        )
                    )

                    if (
                        not previous_date
                        or date_value <
                        str(
                            previous_date
                        )
                    ):
                        revenue_validity_by_platform[
                            platform_key
                        ] = date_value

        else:
            rows = connection.execute(
                """
                SELECT
                    date,
                    platform,
                    channel,
                    spend,
                    impressions,
                    clicks,
                    conversions,
                    revenue
                FROM ad_performance_daily
                WHERE advertiser_id = ?
                ORDER BY
                    date ASC,
                    platform ASC,
                    channel ASC
                """,
                (
                    advertiser_id,
                ),
            ).fetchall()

        if not rows:
            return {
                "status": "blocked",
                "blockCode":
                    "NO_DAILY_PERFORMANCE",
                "message":
                    (
                        "매체별 최적화에 사용할 "
                        "일별 성과 데이터가 없습니다."
                    ),
                "dailyRows": [],
                "channels": [],
            }

        # -----------------------------------------
        # 3. date × channel 집계
        # -----------------------------------------

        daily_channel = {}

        for row in rows:
            date_value = str(
                row["date"] or ""
            )

            platform_value = str(
                row["platform"] or ""
            ).strip()

            channel_value = str(
                row["channel"] or ""
            ).strip()

            entity_name = (
                channel_value
                or platform_value
            )

            if (
                not date_value
                or not entity_name
            ):
                continue

            key = (
                date_value,
                entity_name,
            )

            if key not in daily_channel:
                daily_channel[key] = {
                    "date":
                        date_value,

                    "channel":
                        entity_name,

                    "platform":
                        platform_value,

                    "spend":
                        0.0,

                    "impressions":
                        0.0,

                    "clicks":
                        0.0,

                    "conversions":
                        0.0,

                    "revenue":
                        0.0,
                }

            target = daily_channel[key]

            target["spend"] += float(
                row["spend"] or 0
            )

            target["impressions"] += float(
                row["impressions"] or 0
            )

            target["clicks"] += float(
                row["clicks"] or 0
            )

            target["conversions"] += float(
                row["conversions"] or 0
            )

            target["revenue"] += float(
                row["revenue"] or 0
            )

        daily_rows = list(
            daily_channel.values()
        )
        

        # -----------------------------------------
        # 4. 매체별 진단
        # -----------------------------------------

        channel_groups = {}

        for row in daily_rows:
            channel_name = row[
                "channel"
            ]

            channel_groups.setdefault(
                channel_name,
                [],
            ).append(
                row
            )

        channel_diagnostics = []

        for (
            channel_name,
            channel_rows,
        ) in sorted(
            channel_groups.items()
        ):
            dates = sorted(
                {
                    row["date"]
                    for row
                    in channel_rows
                }
            )

            positive_spend_days = sum(
                1
                for row
                in channel_rows
                if float(
                    row["spend"] or 0
                ) > 0
            )

            positive_revenue_days = sum(
                1
                for row
                in channel_rows
                if float(
                    row["revenue"] or 0
                ) > 0
            )

            total_spend = sum(
                float(
                    row["spend"] or 0
                )
                for row
                in channel_rows
            )

            total_revenue = sum(
                float(
                    row["revenue"] or 0
                )
                for row
                in channel_rows
            )

            platform_names = sorted(
                {
                    str(
                        row.get(
                            "platform",
                            ""
                        )
                    )
                    .strip()
                    .lower()
                    for row
                    in channel_rows
                    if row.get(
                        "platform"
                    )
                }
            )

            primary_platform = (
                platform_names[0]
                if len(
                    platform_names
                ) == 1
                else None
            )

            revenue_valid_start_date = (
                revenue_validity_by_platform.get(
                    primary_platform
                )
                if primary_platform
                else None
            )

            channel_diagnostics.append(
                {
                    "channel":
                        channel_name,

                    "platform":
                        primary_platform,

                    "revenueValidStartDate":
                        revenue_valid_start_date,

                    "revenueValidityAvailable":
                        bool(
                            revenue_valid_start_date
                        ),

                    "totalDays":
                        len(dates),

                    "firstDate":
                        (
                            dates[0]
                            if dates
                            else None
                        ),

                    "lastDate":
                        (
                            dates[-1]
                            if dates
                            else None
                        ),

                    "positiveSpendDays":
                        positive_spend_days,

                    "positiveRevenueDays":
                        positive_revenue_days,

                    "totalSpend":
                        total_spend,

                    "totalRevenue":
                        total_revenue,

                    "historicalRoasPct":
                        (
                            total_revenue
                            / total_spend
                            * 100
                            if total_spend > 0
                            else 0.0
                        ),
                }
            )

        missing_revenue_validity = [
            item["channel"]
            for item
            in channel_diagnostics
            if not item.get(
                "revenueValidityAvailable"
            )
        ]

        return {
            "status": "ok",

            "advertiserId":
                advertiser_id,

            "channelCount":
                len(
                    channel_diagnostics
                ),

            "dailyRows":
                daily_rows,

            "channels":
                channel_diagnostics,

            "missingRevenueValidity":
                missing_revenue_validity,
        }

    finally:
        connection.close()

@app.post(
    "/optimization/channel/readiness"
)
def channel_optimization_readiness(
    payload:
        ChannelOptimizationReadinessPayload,

    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message":
                "advertiserId가 필요합니다.",
        }

    panel = (
        build_channel_optimization_panel(
            advertiser_id=
                payload.advertiserId,

            operator_id=
                operator_id,

            performance_records=
                payload.performanceRecords,

            data_source=
                payload.dataSource,

            revenue_valid_start_dates=
                payload.revenueValidStartDates,
        )
    )

    if panel.get(
        "status"
    ) != "ok":
        return panel

    channel_count = int(
        panel.get(
            "channelCount",
            0,
        )
    )

    if channel_count < 2:
        return {
            "status": "blocked",

            "blockCode":
                "TOO_FEW_CHANNELS",

            "message":
                (
                    "매체별 예산 재배분에는 "
                    "최소 2개 매체가 필요합니다."
                ),

            "channelCount":
                channel_count,

            "channels":
                panel.get(
                    "channels",
                    [],
                ),
        }

    return {
        "status": "ok",

        "optimizationScope":
            "channel",

        "advertiserId":
            payload.advertiserId,

        "channelCount":
            channel_count,

        "dailyPanelRows":
            len(
                panel.get(
                    "dailyRows",
                    [],
                )
            ),

        "maxBudgetChangePct":
            payload.maxBudgetChangePct,

        "channels":
            panel.get(
                "channels",
                [],
            ),

        "message":
            (
                "매체별 최적화용 일별 "
                "성과 패널을 생성했습니다."
            ),
    }

@app.post(
    "/optimization/channel/preview"
)
def channel_optimization_preview(
    payload:
        ChannelOptimizationPreviewPayload,

    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    

    if not payload.advertiserId:
        return {
            "status": "error",
            "message":
                "advertiserId가 필요합니다.",
        }

    if not (
        0
        <= payload.maxBudgetChangePct
        <= 0.30
    ):
        return {
            "status": "error",
            "message":
                (
                    "maxBudgetChangePct는 "
                    "0~0.30 사이여야 합니다."
                ),
        }

    panel = (
        build_channel_optimization_panel(
            advertiser_id=
                payload.advertiserId,

            operator_id=
                operator_id,

            performance_records=
                payload.performanceRecords,

            data_source=
                payload.dataSource,

            revenue_valid_start_dates=
                payload.revenueValidStartDates,
        )
    )

    if panel.get(
        "status"
    ) != "ok":
        return panel

    channel_count = int(
        panel.get(
            "channelCount",
            0,
        )
    )

    # -----------------------------------------
    # 아직 매체가 1개뿐이면
    # Gurobi 호출 자체를 하지 않는다.
    # -----------------------------------------

    if channel_count < 2:
        return {
            "status": "blocked",

            "optimizationScope":
                "channel",

            "blockCode":
                "TOO_FEW_CHANNELS",

            "message":
                (
                    "매체별 예산 재배분에는 "
                    "최소 2개 매체가 필요합니다."
                ),

            "channelCount":
                channel_count,

            "channels":
                panel.get(
                    "channels",
                    [],
                ),

            "productionWriteEnabled":
                False,

            "shadowOnly":
                True,
        }

    # -----------------------------------------
    # 2개 이상인 경우
    #
    # 아직 매체별 Revenue validity 규칙을
    # 완성하지 않았으므로 여기서 안전하게 보류
    # -----------------------------------------

    missing_revenue_validity = (
        panel.get(
            "missingRevenueValidity",
            [],
        )
        or []
    )

    if missing_revenue_validity:
        return {
            "status": "blocked",

            "optimizationScope":
                "channel",

            "blockCode":
                "MISSING_CHANNEL_REVENUE_VALIDITY",

            "message":
                (
                    "일부 매체의 매출 데이터 "
                    "유효 시작일을 확인할 수 없어 "
                    "최적화를 보류합니다."
                ),

            "missingChannels":
                missing_revenue_validity,

            "channelCount":
                channel_count,

            "channels":
                panel.get(
                    "channels",
                    [],
                ),

            "productionWriteEnabled":
                False,

            "shadowOnly":
                True,
        }

    # -----------------------------------------
    # 모든 매체의 Revenue validity가 준비되면
    # 실제 V2 Shadow Preview 실행
    # -----------------------------------------

    revenue_valid_start_dates = {
        str(
            item.get(
                "channel"
            )
        ): str(
            item.get(
                "revenueValidStartDate"
            )
        )
        for item in panel.get(
            "channels",
            [],
        )
        if (
            item.get(
                "channel"
            )
            and item.get(
                "revenueValidStartDate"
            )
        )
    }

    try:
        result = (
            run_naver_optimization_preview(
                advertiser_id=
                    payload.advertiserId,

                operator_id=
                    operator_id,

                account_id=
                    None,

                max_budget_change_pct=
                    payload.maxBudgetChangePct,

                optimization_scope=
                    "channel",

                performance_records=
                    panel.get(
                        "dailyRows",
                        [],
                    ),

                revenue_valid_start_dates=
                    revenue_valid_start_dates,
            )
        )

    except OptimizationPreviewServiceError as error:
        raise HTTPException(
            status_code=
                error.status_code,

            detail=
                error.detail,
        ) from error

    result[
        "channelCount"
    ] = channel_count

    result[
        "channels"
    ] = panel.get(
        "channels",
        [],
    )

    return result

@app.post("/optimize")
def optimize(
    payload: SolverModelPayload,
    token_payload = Depends(
        require_operator
    ),
):
    operator_id = token_payload[
        "sub"
    ]

    if not payload.advertiserId:
        return {
            "status": "error",
            "message": "advertiserId가 필요합니다.",
        }

    connection = get_db_connection()

    try:
        advertiser = connection.execute(
            """
            SELECT id
            FROM advertisers
            WHERE id = ?
            AND owner_operator_id = ?
            LIMIT 1
            """,
            (
                payload.advertiserId,
                operator_id,
            ),
        ).fetchone()

        if advertiser is None:
            return {
                "status": "forbidden",
                "advertiserId": payload.advertiserId,
                "message": "해당 광고주에 접근할 권한이 없습니다.",
            }

    finally:
        connection.close()
    try:
        # Gurobi 모델 생성
        model = gp.Model(payload.modelName)

        # 콘솔 로그를 너무 많이 출력하지 않도록 설정
        model.Params.OutputFlag = 0

        # --------------------------------------------------
        # 1. Gurobi 변수 생성
        # --------------------------------------------------
        gurobi_variables = {}

        for variable in payload.variables:
            gurobi_variables[variable.name] = model.addVar(
                lb=variable.lb,
                ub=variable.ub,
                vtype=GRB.CONTINUOUS,
                name=variable.name,
            )

        model.update()

        # --------------------------------------------------
        # 2. 목적함수 생성
        # --------------------------------------------------
        objective_expression = gp.quicksum(
            variable.objectiveCoefficient * gurobi_variables[variable.name]
            for variable in payload.variables
        )

        if payload.objective.sense == "maximize":
            model.setObjective(
                objective_expression,
                GRB.MAXIMIZE,
            )
        else:
            model.setObjective(
                objective_expression,
                GRB.MINIMIZE,
            )

        # --------------------------------------------------
        # 3. 제약조건 생성
        # --------------------------------------------------
        for constraint in payload.constraints:
            expression = gp.quicksum(
                coefficient.coefficient * gurobi_variables[coefficient.variable]
                for coefficient in constraint.coefficients
            )

            if constraint.sense == "equal":
                model.addConstr(
                    expression == constraint.rhs,
                    name=constraint.name,
                )

            elif constraint.sense == "greaterOrEqual":
                model.addConstr(
                    expression >= constraint.rhs,
                    name=constraint.name,
                )

            elif constraint.sense == "lessOrEqual":
                model.addConstr(
                    expression <= constraint.rhs,
                    name=constraint.name,
                )

        # --------------------------------------------------
        # 4. 최적화 실행
        # --------------------------------------------------

        risk_diagnostics = None

        if payload.objective.metric == "riskAdjustedRevenue":
            # --------------------------------------------------
            # 4-1. 채널별 상대 리스크 식 생성
            #
            # Risk =
            # (1 / N) *
            # sum(
            #   riskWeight_i *
            #   deviation_i /
            #   currentBudget_i
            # )
            # --------------------------------------------------

            risk_terms = []

            channel_count = max(
                len(payload.channelBudgets),
                1,
            )

            for variable in payload.variables:
                if not variable.name.endswith("__risk_deviation"):
                    continue

                channel_name = variable.channel

                current_budget = None

                for channel_budget in payload.channelBudgets:
                    if channel_budget.channel == channel_name:
                        current_budget = channel_budget.currentBudget
                        break

                if current_budget is None or current_budget <= 0:
                    continue

                risk_weight = 1.0

                for risk_metric in payload.channelRiskMetrics:
                    if risk_metric.channel == channel_name:
                        risk_weight = risk_metric.riskWeight
                        break

                coefficient = risk_weight / current_budget / channel_count

                risk_terms.append(coefficient * gurobi_variables[variable.name])

            risk_expression = gp.quicksum(risk_terms)

            # --------------------------------------------------
            # 4-2. 최소 가능한 리스크 R_min 계산
            # --------------------------------------------------

            model.setObjective(
                risk_expression,
                GRB.MINIMIZE,
            )

            model.optimize()

            if model.Status != GRB.OPTIMAL:
                return {
                    "status": "risk_baseline_error",
                    "message": "최소 리스크 기준을 계산할 수 없습니다.",
                    "gurobiStatus": model.Status,
                }

            minimum_risk = float(model.ObjVal)

            # --------------------------------------------------
            # 4-3. 리스크 제약 없이 매출 최대화
            #
            # 먼저 최대 매출 수준을 구한 뒤,
            # 그 최대 매출 수준을 유지하면서
            # 필요한 최소 리스크를 다시 계산
            # --------------------------------------------------

            model.setObjective(
                objective_expression,
                GRB.MAXIMIZE,
            )

            model.optimize()

            if model.Status != GRB.OPTIMAL:
                return {
                    "status": "revenue_baseline_error",
                    "message": "매출 최대화 기준해를 계산할 수 없습니다.",
                    "gurobiStatus": model.Status,
                }

            revenue_baseline_objective = float(objective_expression.getValue())

            # --------------------------------------------------
            # 4-3-1. 최대 매출 수준을 거의 그대로 유지하면서
            # 리스크 최소화
            # --------------------------------------------------

            revenue_baseline_tolerance = max(
                abs(revenue_baseline_objective) * 1e-8,
                1e-6,
            )

            revenue_baseline_constraint = model.addConstr(
                objective_expression
                >= (revenue_baseline_objective - revenue_baseline_tolerance),
                name="preserve_revenue_baseline",
            )

            model.setObjective(
                risk_expression,
                GRB.MINIMIZE,
            )

            model.optimize()

            if model.Status != GRB.OPTIMAL:
                return {
                    "status": "revenue_risk_baseline_error",
                    "message": "최대 매출 수준에서 최소 리스크를 계산할 수 없습니다.",
                    "gurobiStatus": model.Status,
                }

            revenue_optimal_risk = float(risk_expression.getValue())

            # 다음 단계에서 다시 다른 risk limit을 적용해야 하므로
            # 임시 baseline 제약 제거
            model.remove(revenue_baseline_constraint)

            model.update()

            # --------------------------------------------------
            # 4-4. 사용자가 선택한 리스크 수준을
            # R_min ~ R_revenue 사이에 동적으로 배치
            # --------------------------------------------------

            if payload.riskLevel == "low":
                interpolation = 0.25

            elif payload.riskLevel == "high":
                interpolation = 0.95

            else:
                # medium
                interpolation = 0.60

            risk_range = max(
                revenue_optimal_risk - minimum_risk,
                0.0,
            )

            dynamic_risk_limit = minimum_risk + interpolation * risk_range

            # 수치오차 때문에 최소 feasible risk보다
            # 아주 조금 여유를 둠
            numerical_tolerance = 1e-9

            dynamic_risk_limit = max(
                dynamic_risk_limit,
                minimum_risk + numerical_tolerance,
            )

            # --------------------------------------------------
            # 4-5. 동적 Risk Budget 제약 추가
            # --------------------------------------------------

            model.addConstr(
                risk_expression <= dynamic_risk_limit,
                name="portfolio_risk_limit_dynamic",
            )

            model.update()

            # --------------------------------------------------
            # 4-6. 1차 최적화
            # Risk Budget 안에서 매출 최대화
            # --------------------------------------------------

            model.setObjective(
                objective_expression,
                GRB.MAXIMIZE,
            )

            model.optimize()

            if model.Status != GRB.OPTIMAL:
                return {
                    "status": "risk_adjusted_revenue_error",
                    "message": "리스크 제약 하에서 매출 최적해를 계산할 수 없습니다.",
                    "gurobiStatus": model.Status,
                }

            best_revenue_objective = float(objective_expression.getValue())

            # --------------------------------------------------
            # 4-7. 1차 최적화에서 얻은 최대 매출 수준을 고정
            #
            # 수치 오차 때문에 아주 작은 tolerance 허용
            # --------------------------------------------------

            revenue_tolerance = max(
                abs(best_revenue_objective) * 1e-8,
                1e-6,
            )

            model.addConstr(
                objective_expression >= (best_revenue_objective - revenue_tolerance),
                name="preserve_revenue_optimum",
            )

            # --------------------------------------------------
            # 4-8. 2차 최적화
            #
            # 동일한 최대 매출 수준을 유지하면서
            # deviation 변수의 실제 값을 최소화
            # --------------------------------------------------

            model.setObjective(
                risk_expression,
                GRB.MINIMIZE,
            )

            model.optimize()

            if model.Status != GRB.OPTIMAL:
                return {
                    "status": "risk_refinement_error",
                    "message": "최적 매출 수준에서 최소 리스크 해를 계산할 수 없습니다.",
                    "gurobiStatus": model.Status,
                }

            realized_risk = float(risk_expression.getValue())

            risk_diagnostics = {
                "minimumRisk": minimum_risk,
                "revenueOptimalRisk": revenue_optimal_risk,
                "dynamicRiskLimit": dynamic_risk_limit,
                "realizedRisk": realized_risk,
                "riskLevel": payload.riskLevel,
                "interpolation": interpolation,
                "bestRevenueObjective": best_revenue_objective,
            }

        else:
            # 일반 매출/전환/ROAS/CPA 최적화는
            # 기존 방식 그대로 한 번만 실행
            model.optimize()

        # --------------------------------------------------
        # 5. 결과 처리
        # --------------------------------------------------
        if model.Status == GRB.OPTIMAL:
            solution = []

            for variable in payload.variables:

                # risk deviation 보조변수는
                # 매체별 예산 결과 테이블에서 제외
                if variable.name.endswith("__risk_deviation"):
                    continue

                value = gurobi_variables[variable.name].X

                solution.append(
                    {
                        "name": variable.name,
                        "channel": variable.channel,
                        "segmentIndex": variable.segmentIndex,
                        "value": value,
                    }
                )

            return {
                "status": "optimal",
                "objectiveValue": model.ObjVal,
                "variableCount": model.NumVars,
                "constraintCount": model.NumConstrs,
                "solution": solution,
                "riskDiagnostics": risk_diagnostics,
            }

        # --------------------------------------------------
        # INFEASIBLE
        # --------------------------------------------------
        if model.Status == GRB.INFEASIBLE:
            model.computeIIS()

            conflicting_constraints = []

            for constraint in model.getConstrs():
                if constraint.IISConstr:
                    conflicting_constraints.append(constraint.ConstrName)

            conflicting_bounds = []

            for variable in model.getVars():

                if variable.IISLB:
                    conflicting_bounds.append(
                        {
                            "variable": variable.VarName,
                            "bound": "lower",
                            "value": variable.LB,
                        }
                    )

                if variable.IISUB:
                    conflicting_bounds.append(
                        {
                            "variable": variable.VarName,
                            "bound": "upper",
                            "value": variable.UB,
                        }
                    )

            return {
                "status": "infeasible",
                "message": "현재 제약조건에서는 가능한 최적해가 없습니다.",
                "conflictingConstraints": conflicting_constraints,
                "conflictingBounds": conflicting_bounds,
            }

        # --------------------------------------------------
        # UNBOUNDED
        # --------------------------------------------------
        if model.Status == GRB.UNBOUNDED:
            return {
                "status": "unbounded",
                "message": "목적함수가 무한히 증가할 수 있습니다.",
            }

        # 기타 Solver 상태
        return {
            "status": "unknown",
            "gurobiStatus": model.Status,
        }

    except gp.GurobiError as error:
        return {
            "status": "gurobi_error",
            "message": str(error),
        }

    except Exception as error:
        return {
            "status": "error",
            "message": str(error),
        }
