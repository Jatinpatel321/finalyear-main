import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.fcm import send_push
from app.core.order_events import publish_order_event
from app.core.sms import send_sms
from app.core.time_utils import utcnow_naive
from app.modules.notifications.model import Notification, NotificationType

logger = logging.getLogger("tnt.notifications")

REDIS_QUEUE_KEY = "tnt:notifications:queue"


def _enqueue_to_redis(user_id: int, notification_id: int, title: str, message: str, notification_type: str) -> None:
    try:
        from app.core.redis import redis_client
        payload = json.dumps({
            "user_id": user_id,
            "notification_id": notification_id,
            "title": title,
            "message": message,
            "type": notification_type,
        })
        redis_client.lpush(REDIS_QUEUE_KEY, payload)
        redis_client.expire(REDIS_QUEUE_KEY, 86400)
        logger.info("notification_enqueued user_id=%s id=%s", user_id, notification_id)
    except Exception:
        logger.exception("notification_redis_enqueue_failed user_id=%s", user_id)


def notify_user(
    user_id: int,
    phone: str,
    title: str,
    message: str,
    db: Session,
    send_sms_flag: bool = True,
    notification_type: NotificationType = NotificationType.SYSTEM,
    reference_id: Optional[int] = None,
):
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        reference_id=reference_id,
    )

    db.add(notification)
    db.flush()

    # Push notification via FCM
    try:
        from app.modules.users.model import User
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.device_token and getattr(user, 'push_enabled', True):
            send_push(
                device_token=user.device_token,
                title=title,
                body=message,
                data={"notification_type": notification_type.value, "reference_id": reference_id},
            )
    except Exception:
        logger.exception("notification_push_fcm_failed user_id=%s", user_id)

    try:
        _enqueue_to_redis(
            user_id=user_id,
            notification_id=notification.id,
            title=title,
            message=message,
            notification_type=notification_type.value,
        )
    except Exception:
        logger.exception("notification_redis_enqueue_failed user_id=%s", user_id)

    # Broadcast notification event to user's WebSocket channel
    try:
        publish_order_event(
            order_id=reference_id or 0,
            event="notification",
            data={
                "user_id": user_id,
                "title": title,
                "message": message,
                "notification_type": notification_type.value,
                "reference_id": reference_id,
                "created_at": utcnow_naive().isoformat(),
            },
        )
    except Exception:
        logger.exception("notification_event_publish_failed user_id=%s", user_id)

    if send_sms_flag:
        try:
            send_sms(phone, message)
        except Exception:
            logger.exception("notification_sms_failed user_id=%s phone=%s", user_id, phone)

    return notification


def get_unread_count(user_id: int, db: Session) -> int:
    return db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.is_read == False,
    ).count()


def mark_all_read(user_id: int, db: Session) -> int:
    rows = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.is_read == False,
    ).all()
    count = len(rows)
    for row in rows:
        row.is_read = True
    db.flush()
    return count


def get_notification_history(
    user_id: int,
    db: Session,
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
) -> dict:
    """Return paginated notification history for a user."""
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    total = q.count()
    items = (
        q.order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items,
    }


# Alias for backward compatibility with router imports
send_notification = notify_user


def get_notification_preferences(user_id: int, db: Session) -> dict:
    """Return push notification preferences for the user.

    Returns a dict with defaults that can be stored on the user model
    or in a separate preferences table.
    """
    from app.modules.users.model import User
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {}
    return {
        "push_enabled": getattr(user, "push_enabled", True),
        "sms_enabled": True,
        "order_updates": True,
        "promotions": False,
        "delay_alerts": True,
    }
