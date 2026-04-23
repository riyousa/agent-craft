"""Logging configuration with rotating file handler."""
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


# Create logs directory (relative to agent-api/)
LOGS_DIR = Path(__file__).parent.parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)


class ColoredFormatter(logging.Formatter):
    """Colored log formatter for console output."""

    COLORS = {
        'DEBUG': '\033[36m',      # Cyan
        'INFO': '\033[32m',       # Green
        'WARNING': '\033[33m',    # Yellow
        'ERROR': '\033[31m',      # Red
        'CRITICAL': '\033[35m',   # Magenta
    }
    RESET = '\033[0m'

    def format(self, record):
        log_color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{log_color}{record.levelname}{self.RESET}"
        return super().format(record)


def setup_logger(
    name: str,
    log_file: str = None,
    level: int = logging.INFO,
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5,
    console: bool = True,
) -> logging.Logger:
    """Setup logger with rotating file handler and console output.

    Args:
        name: Logger name
        log_file: Log file name (without path). If None, uses name.log
        level: Logging level
        max_bytes: Maximum log file size before rotation (default 10MB)
        backup_count: Number of backup files to keep
        console: Whether to output to console

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Avoid duplicate handlers
    if logger.handlers:
        return logger

    # Create formatters
    file_formatter = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    console_formatter = ColoredFormatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%H:%M:%S'
    )

    # File handler with rotation
    if log_file is None:
        log_file = f"{name}.log"

    file_path = LOGS_DIR / log_file
    file_handler = RotatingFileHandler(
        file_path,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding='utf-8'
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

    # Console handler
    if console:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(level)
        console_handler.setFormatter(console_formatter)
        logger.addHandler(console_handler)

    logger.info(f"Logger '{name}' initialized. Log file: {file_path}")

    return logger


def get_logger(name: str) -> logging.Logger:
    """Get or create a logger instance.

    Args:
        name: Logger name

    Returns:
        Logger instance
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        return setup_logger(name)
    return logger


# Create default loggers
api_logger = setup_logger('api', 'api.log', level=logging.INFO)
tools_logger = setup_logger('tools', 'tools.log', level=logging.DEBUG)
agent_logger = setup_logger('agent', 'agent.log', level=logging.INFO)
db_logger = setup_logger('database', 'database.log', level=logging.WARNING)


# Export commonly used loggers
__all__ = [
    'setup_logger',
    'get_logger',
    'api_logger',
    'tools_logger',
    'agent_logger',
    'db_logger',
    'LOGS_DIR',
]
