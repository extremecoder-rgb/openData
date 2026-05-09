"""
WattWatch - Intelligent Occupancy Detection System

YOLOv8-based real-time people detection and counting.
"""

__version__ = "0.1.0"
__author__ = "WattWatch Team"

from src.detector import YOLODetector
from src.utils import FPSCounter, VideoFrameExtractor, JSONLogger

__all__ = [
    "YOLODetector",
    "FPSCounter",
    "VideoFrameExtractor",
    "JSONLogger",
]


# no listen first i make the model for fan on or off light on or off and detect human or not if there are no human detect then light off and fan off this is the existing model now i want to make separate page separate new camera that open detect the human face and tell me first how i store the human face id like i want to say how attendance monitoring work this type of i mean first time student face store when they came our project says verified and this verified face we are using for attendance and also if their unknown human come in our college it also detect make it  at first tell me then make the promt