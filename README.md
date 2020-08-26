# quaver-verifier

A tool to check for errors in quaver maps.

Checks for:

- Non-mp3 audio file format
- Audio bitrate > 192kbps.
- Background image resolutions less than 1280x720
- Background image file size > 4MB 
- Difficulty name existence
- Supported keycount (4K, 7K)
- Empty columns
- Overlapping objects
- 30s or longer break times
- Less than 75% of length mapped
- Minimum difficulty spread
- Prefixes for hybrid sets
- Multiple audio files
- Conflicting metadata
- Non-romanized titles and artists
- Repeated metadata