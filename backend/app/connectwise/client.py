import base64

import httpx

from app.config import Settings
from app.connectwise.schemas import Customer

PAGE_SIZE = 1000


class ConnectWiseAPIError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"ConnectWise API error ({status_code}): {detail}")


class ConnectWiseClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.cw_base_url.rstrip("/")
        self._client_id = settings.cw_client_id

        auth_string = f"{settings.cw_company_id}+{settings.cw_public_key}:{settings.cw_private_key}"
        token = base64.b64encode(auth_string.encode()).decode()

        self._headers = {
            "Authorization": f"Basic {token}",
            "clientId": self._client_id,
            "Accept": "application/json",
        }

    async def get_all_customers(self, status_name: str | None = "Active") -> list[Customer]:
        customers: list[Customer] = []
        page = 1

        conditions = "deletedFlag=false"
        if status_name:
            conditions += f' and status/name="{status_name}"'

        async with httpx.AsyncClient(base_url=self._base_url, headers=self._headers, timeout=30.0) as client:
            while True:
                response = await client.get(
                    "/company/companies",
                    params={
                        "page": page,
                        "pageSize": PAGE_SIZE,
                        "conditions": conditions,
                        "orderBy": "name asc",
                    },
                )

                if response.status_code != 200:
                    raise ConnectWiseAPIError(response.status_code, response.text)

                batch = response.json()
                if not batch:
                    break

                for record in batch:
                    customers.append(
                        Customer(
                            id=record["id"],
                            identifier=record.get("identifier", ""),
                            name=record.get("name", ""),
                            status=(record.get("status") or {}).get("name"),
                            types=[t["name"] for t in record.get("types") or [] if t.get("name")],
                            market=(record.get("market") or {}).get("name"),
                            website=record.get("website"),
                        )
                    )

                if len(batch) < PAGE_SIZE:
                    break
                page += 1

        return customers
