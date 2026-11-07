from typing import Optional, Protocol


class EmailProvider(Protocol):
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        ...

    async def send_verification_email(
        self,
        to_email: str,
        verification_link: str
    ) -> bool:
        ...

    async def send_password_reset_email(
        self,
        to_email: str,
        reset_link: str
    ) -> bool:
        ...

    async def send_member_invite_email(
        self,
        to_email: str,
        inviter_email: str,
        workspace_name: str,
        invite_link: str
    ) -> bool:
        ...
