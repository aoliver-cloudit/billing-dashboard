import base64

import httpx

from app.config import Settings
from app.connectwise.schemas import Addition, AdditionSyncResult, Customer

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

    async def get_additions_for_company(self, company_id: int) -> list[Addition]:
        additions: list[Addition] = []

        async with httpx.AsyncClient(
            base_url=self._base_url, headers=self._headers, timeout=30.0
        ) as client:
            agreements_response = await client.get(
                "/finance/agreements",
                params={
                    "conditions": f"company/id={company_id} and cancelledFlag=false",
                    "pageSize": PAGE_SIZE,
                    "fields": "id,name",
                },
            )
            if agreements_response.status_code != 200:
                raise ConnectWiseAPIError(agreements_response.status_code, agreements_response.text)

            for agreement in agreements_response.json():
                agreement_id = agreement["id"]
                agreement_name = agreement.get("name")

                additions_response = await client.get(
                    f"/finance/agreements/{agreement_id}/additions",
                    params={
                        "conditions": "cancelledDate=null",
                        "pageSize": PAGE_SIZE,
                    },
                )
                if additions_response.status_code != 200:
                    raise ConnectWiseAPIError(
                        additions_response.status_code, additions_response.text
                    )

                for record in additions_response.json():
                    product = record.get("product") or {}
                    additions.append(
                        Addition(
                            id=record["id"],
                            agreement_id=agreement_id,
                            agreement_name=agreement_name,
                            product_id=product.get("id"),
                            product_identifier=product.get("identifier"),
                            description=record.get("description") or product.get("description"),
                            quantity=record.get("quantity", 0),
                        )
                    )

        return additions

    async def sync_addition_quantities(
        self, updates: list[tuple[int, int, float]]
    ) -> list[AdditionSyncResult]:
        results: list[AdditionSyncResult] = []

        async with httpx.AsyncClient(
            base_url=self._base_url, headers=self._headers, timeout=30.0
        ) as client:
            for agreement_id, addition_id, quantity in updates:
                response = await client.patch(
                    f"/finance/agreements/{agreement_id}/additions/{addition_id}",
                    json=[{"op": "replace", "path": "/quantity", "value": quantity}],
                )
                if response.status_code == 200:
                    results.append(AdditionSyncResult(addition_id=addition_id, success=True))
                else:
                    results.append(
                        AdditionSyncResult(
                            addition_id=addition_id, success=False, error=response.text
                        )
                    )

        return results
